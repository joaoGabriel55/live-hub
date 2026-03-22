import * as storage from "./storage.js";
import * as youtube from "./youtube.js";
import * as ui from "./ui.js";

let refreshTimer = null;
let refreshIndex = 0;
let selectedChannelId = null;

// === Initialization ===

async function init() {
  ui.initPasswordToggles();
  updateQuota();

  const apiKey = storage.getApiKey();
  if (!apiKey) {
    ui.showApiKeyPrompt(handleApiKeySubmit);
    return;
  }

  const channels = storage.getChannels();
  renderSidebar();

  if (channels.length === 0) {
    ui.showContentEmpty(true);
    ui.showStreamsContainer(false);
  } else {
    ui.showContentEmpty(false);
    ui.showStreamsContainer(true);
    await refreshLive();
  }

  startAutoRefresh();
  wireEvents();
}

// === Event Wiring ===

function wireEvents() {
  document
    .getElementById("add-channel-btn")
    .addEventListener("click", handleAddChannel);
  document.getElementById("channel-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAddChannel();
  });

  document.getElementById("refresh-btn").addEventListener("click", () => {
    refreshLive();
    if (selectedChannelId) refreshSelectedChannel();
    ui.showToast("Refreshing...", "info");
  });

  document.getElementById("settings-btn").addEventListener("click", () => {
    ui.showSettingsModal(
      {
        apiKey: storage.getApiKey(),
        refreshInterval: storage.getSettings().refreshInterval,
      },
      handleSettingsSave,
    );
  });

  document
    .getElementById("close-player")
    .addEventListener("click", () => ui.hidePlayer());

  document
    .getElementById("settings-clear-cache")
    .addEventListener("click", () => {
      storage.clearCache();
      ui.showToast("Cache cleared", "success");
    });

  // Sidebar drawer toggle (mobile)
  ui.initSidebarToggle();
}

// === API Key ===

async function handleApiKeySubmit(key) {
  const valid = await youtube.validateApiKey(key);
  if (!valid) throw new Error("Invalid API key. Please check and try again.");
  storage.setApiKey(key);
  updateQuota();

  const channels = storage.getChannels();
  renderSidebar();

  if (channels.length === 0) {
    ui.showContentEmpty(true);
    ui.showStreamsContainer(false);
  }

  startAutoRefresh();
  wireEvents();
}

// === Settings ===

function handleSettingsSave(settings) {
  if (settings.apiKey) storage.setApiKey(settings.apiKey);
  storage.setSettings({ refreshInterval: settings.refreshInterval });
  stopAutoRefresh();
  startAutoRefresh();
  ui.showToast("Settings saved", "success");
}

// === Channel Management ===

async function handleAddChannel() {
  const input = document.getElementById("channel-input");
  const btn = document.getElementById("add-channel-btn");
  const query = input.value.trim();
  if (!query) return;

  btn.disabled = true;
  btn.textContent = "Adding...";

  try {
    const channel = await youtube.resolveChannel(query);
    if (!channel) {
      ui.showToast("Channel not found", "error");
      return;
    }

    const added = storage.addChannel(channel);
    if (!added) {
      ui.showToast("Channel already added", "warning");
      return;
    }

    input.value = "";
    ui.showContentEmpty(false);
    ui.showStreamsContainer(true);
    ui.showToast(`Added ${channel.title}`, "success");

    // Auto-select the newly added channel
    selectedChannelId = channel.id;
    renderSidebar();
    await refreshLive();
    await refreshSelectedChannel();
    updateQuota();
  } catch (e) {
    ui.showToast(e.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Add";
  }
}

function handleRemoveChannel(channelId) {
  storage.removeChannel(channelId);

  // If the removed channel was selected, clear selection
  if (selectedChannelId === channelId) {
    selectedChannelId = null;
    allStreams.upcoming = [];
    allStreams.completed = [];
  }

  // Remove live streams from this channel
  allStreams.live = allStreams.live.filter((s) => s.channelId !== channelId);

  renderSidebar();
  renderAllStreams();

  const channels = storage.getChannels();
  if (channels.length === 0) {
    ui.showContentEmpty(true);
    ui.showStreamsContainer(false);
  }

  ui.showToast("Channel removed", "info");
}

async function handleSelectChannel(channelId) {
  if (selectedChannelId === channelId) {
    // Deselect
    selectedChannelId = null;
    allStreams.upcoming = [];
    allStreams.completed = [];
    renderSidebar();
    renderAllStreams();
    return;
  }

  selectedChannelId = channelId;
  renderSidebar();

  await refreshSelectedChannel();
}

// === Rendering ===

function renderSidebar() {
  const channels = storage.getChannels();
  ui.renderChannelList(channels, selectedChannelId, {
    onSelect: handleSelectChannel,
    onRemove: handleRemoveChannel,
  });
}

// === Stream Fetching ===

// Aggregate streams: live from all channels, upcoming/completed only for selected channel
let allStreams = { live: [], upcoming: [], completed: [] };

async function refreshLive() {
  const channels = storage.getChannels();
  if (!channels.length) return;

  ui.renderLoadingState("live-streams");

  allStreams.live = [];

  const results = await Promise.allSettled(
    channels.map((ch) => youtube.fetchLiveStreams(ch.id)),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allStreams.live.push(...result.value);
    }
  }

  // Enrich live streams with video details
  const liveIds = allStreams.live.map((s) => s.videoId);
  try {
    const details = await youtube.fetchVideoDetails(liveIds);
    const detailMap = new Map(details.map((d) => [d.videoId, d]));
    allStreams.live = allStreams.live.map((s) => ({
      ...s,
      ...(detailMap.get(s.videoId) || {}),
    }));
  } catch {
    /* non-critical */
  }

  renderAllStreams();
  updateQuota();
}

async function refreshSelectedChannel() {
  if (!selectedChannelId) return;

  ui.renderLoadingState("upcoming-streams");
  ui.renderLoadingState("completed-streams");

  try {
    const [upcoming, completed] = await Promise.all([
      youtube.fetchUpcomingStreams(selectedChannelId).catch(() => []),
      youtube.fetchCompletedStreams(selectedChannelId).catch(() => []),
    ]);

    // Enrich with video details
    const allIds = [...upcoming, ...completed].map((s) => s.videoId);
    let details = [];
    try {
      details = await youtube.fetchVideoDetails(allIds);
    } catch {
      /* non-critical */
    }

    const detailMap = new Map(details.map((d) => [d.videoId, d]));
    const enrich = (streams) =>
      streams.map((s) => ({ ...s, ...(detailMap.get(s.videoId) || {}) }));

    allStreams.upcoming = enrich(upcoming);
    allStreams.completed = enrich(completed);
  } catch (e) {
    ui.showToast(`Error fetching streams: ${e.message}`, "error");
  }

  renderAllStreams();
  updateQuota();
}

async function refreshLiveFromCache() {
  const channels = storage.getChannels();
  allStreams.live = [];

  const results = await Promise.allSettled(
    channels.map((ch) => youtube.fetchLiveStreams(ch.id)),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allStreams.live.push(...result.value);
    }
  }

  renderAllStreams();
  updateQuota();
}

function renderAllStreams() {
  const onClick = (videoId) => ui.showPlayer(videoId);

  ui.renderStreams("live-streams", allStreams.live, onClick);

  if (selectedChannelId) {
    document.getElementById("upcoming-section").classList.remove("hidden");
    document.getElementById("completed-section").classList.remove("hidden");
    ui.renderStreams("upcoming-streams", allStreams.upcoming, onClick);
    ui.renderStreams("completed-streams", allStreams.completed, onClick);
  } else {
    document.getElementById("upcoming-section").classList.add("hidden");
    document.getElementById("completed-section").classList.add("hidden");
  }
}

// === Auto Refresh ===

function startAutoRefresh() {
  stopAutoRefresh();
  const intervalMin = storage.getSettings().refreshInterval || 15;
  const intervalMs = intervalMin * 60 * 1000;

  refreshTimer = setInterval(() => {
    if (!youtube.isQuotaSafe()) {
      stopAutoRefresh();
      ui.showToast(
        "Auto-refresh paused: approaching daily quota limit",
        "warning",
      );
      return;
    }

    const channels = storage.getChannels();
    if (!channels.length) return;

    // Round-robin: refresh one channel's live streams
    const channel = channels[refreshIndex % channels.length];
    refreshIndex++;

    youtube
      .fetchLiveStreams(channel.id)
      .then(() => refreshLiveFromCache())
      .catch(() => {}); // Silently fail for background refresh
  }, intervalMs);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// === Quota ===

function updateQuota() {
  const info = youtube.getQuotaInfo();
  ui.updateQuotaDisplay(info.used, info.limit);
}

// === Start ===

document.addEventListener("DOMContentLoaded", init);
