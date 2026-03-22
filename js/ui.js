// === DOM Helpers ===

function el(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") element.className = value;
    else if (key === "textContent") element.textContent = value;
    else if (key.startsWith("on"))
      element.addEventListener(key.slice(2).toLowerCase(), value);
    else element.setAttribute(key, value);
  }
  for (const child of children) {
    if (typeof child === "string")
      element.appendChild(document.createTextNode(child));
    else if (child) element.appendChild(child);
  }
  return element;
}

function clearEl(id) {
  const container = document.getElementById(id);
  if (container) container.innerHTML = "";
  return container;
}

// === Formatting ===

function formatViewers(count) {
  if (!count) return "";
  const n = parseInt(count, 10);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M watching";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K watching";
  return n + " watching";
}

function formatTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = date - now;
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin > 0 && diffMin < 60) return `In ${diffMin} min`;
  if (diffMin >= 60 && diffMin < 1440)
    return `In ${Math.round(diffMin / 60)} hr`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeAgo(isoString) {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

// === Channel List ===

export function renderChannelList(
  channels,
  selectedId,
  { onSelect, onRemove },
) {
  const list = clearEl("channel-list");
  const emptyHint = document.getElementById("channel-empty");

  if (!channels.length) {
    if (emptyHint) emptyHint.classList.remove("hidden");
    return;
  }
  if (emptyHint) emptyHint.classList.add("hidden");

  for (const channel of channels) {
    const isActive = channel.id === selectedId;
    const item = el(
      "li",
      { className: `channel-item${isActive ? " active" : ""}` },
      [
        el("img", {
          className: "channel-avatar",
          src: channel.thumbnailUrl || "",
          alt: channel.title,
          loading: "lazy",
        }),
        el("div", { className: "channel-info" }, [
          el("div", { className: "channel-title", textContent: channel.title }),
          el("div", {
            className: "channel-handle",
            textContent: channel.handle,
          }),
        ]),
        el("button", {
          className: "channel-remove",
          textContent: "\u00d7",
          title: "Remove channel",
          onClick: (e) => {
            e.stopPropagation();
            onRemove(channel.id);
          },
        }),
      ],
    );
    item.addEventListener("click", () => onSelect(channel.id));
    list.appendChild(item);
  }
}

// === Stream Cards ===

function createStreamCard(stream, onClick) {
  const overlays = [];

  if (stream.eventType === "live") {
    overlays.push(el("span", { className: "live-badge", textContent: "LIVE" }));
    if (stream.concurrentViewers) {
      overlays.push(
        el("span", {
          className: "viewer-count",
          textContent: formatViewers(stream.concurrentViewers),
        }),
      );
    }
  } else if (stream.eventType === "upcoming" && stream.scheduledStartTime) {
    overlays.push(
      el("span", {
        className: "scheduled-badge",
        textContent: formatTime(stream.scheduledStartTime),
      }),
    );
  }

  const card = el(
    "div",
    { className: "stream-card", "data-video-id": stream.videoId },
    [
      el("div", { className: "thumbnail-wrapper" }, [
        el("img", {
          src: stream.thumbnailUrl,
          alt: stream.title,
          loading: "lazy",
        }),
        ...overlays,
      ]),
      el("div", { className: "stream-info" }, [
        el("div", { className: "stream-title", textContent: stream.title }),
        el("div", {
          className: "stream-meta",
          textContent:
            stream.channelTitle +
            (stream.eventType === "completed"
              ? " \u2022 " +
                timeAgo(stream.actualStartTime || stream.publishedAt)
              : ""),
        }),
      ]),
    ],
  );

  card.addEventListener("click", () => onClick(stream.videoId));
  return card;
}

export function renderStreams(sectionId, streams, onStreamClick) {
  const container = clearEl(sectionId);
  if (!container) return;

  if (!streams.length) {
    container.appendChild(
      el("div", {
        className: "stream-empty",
        textContent: "No streams found.",
      }),
    );
    return;
  }

  for (const stream of streams) {
    container.appendChild(createStreamCard(stream, onStreamClick));
  }
}

// === Loading State ===

export function renderLoadingState(sectionId) {
  const container = clearEl(sectionId);
  if (!container) return;

  for (let i = 0; i < 3; i++) {
    container.appendChild(
      el("div", { className: "skeleton-card" }, [
        el("div", { className: "skeleton-thumb" }),
        el("div", { className: "skeleton-text" }, [
          el("div", { className: "skeleton-line" }),
          el("div", { className: "skeleton-line" }),
        ]),
      ]),
    );
  }
}

export function renderEmptyState(sectionId, message) {
  const container = clearEl(sectionId);
  if (!container) return;
  container.appendChild(
    el("div", { className: "stream-empty", textContent: message }),
  );
}

// === Player ===

export function showPlayer(videoId) {
  const area = document.getElementById("player-area");
  const iframe = document.getElementById("player");
  const link = document.getElementById("open-youtube");

  iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1`;
  link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  area.classList.remove("hidden");
  area.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function hidePlayer() {
  const area = document.getElementById("player-area");
  const iframe = document.getElementById("player");
  iframe.src = "";
  area.classList.add("hidden");
}

// === API Key Prompt ===

export function showApiKeyPrompt(onSubmit) {
  const modal = document.getElementById("apikey-modal");
  const input = document.getElementById("apikey-input");
  const btn = document.getElementById("apikey-submit");
  const error = document.getElementById("apikey-error");

  modal.classList.remove("hidden");
  input.value = "";
  error.classList.add("hidden");
  input.focus();

  const handler = async () => {
    const key = input.value.trim();
    if (!key) return;

    btn.disabled = true;
    btn.textContent = "Validating...";
    error.classList.add("hidden");

    try {
      await onSubmit(key);
      modal.classList.add("hidden");
    } catch (e) {
      error.textContent = e.message || "Invalid API key";
      error.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Key";
    }
  };

  btn.onclick = handler;
  input.onkeydown = (e) => {
    if (e.key === "Enter") handler();
  };
}

export function hideApiKeyPrompt() {
  document.getElementById("apikey-modal").classList.add("hidden");
}

// === Settings Modal ===

export function showSettingsModal(settings, onSave) {
  const modal = document.getElementById("settings-modal");
  const apiKeyInput = document.getElementById("settings-apikey");
  const intervalInput = document.getElementById("settings-interval");

  apiKeyInput.value = settings.apiKey || "";
  intervalInput.value = settings.refreshInterval || 15;
  modal.classList.remove("hidden");

  document.getElementById("settings-save").onclick = () => {
    onSave({
      apiKey: apiKeyInput.value.trim(),
      refreshInterval: Math.max(5, parseInt(intervalInput.value, 10) || 15),
    });
    modal.classList.add("hidden");
  };

  document.getElementById("settings-close").onclick = () => {
    modal.classList.add("hidden");
  };
}

// === Quota Display ===

export function updateQuotaDisplay(used, limit) {
  const el = document.getElementById("quota-display");
  if (!el) return;
  el.textContent = `${used.toLocaleString()} / ${limit.toLocaleString()}`;
  el.classList.remove("warning", "danger");
  if (used >= limit * 0.8) el.classList.add("danger");
  else if (used >= limit * 0.5) el.classList.add("warning");
}

// === Toast ===

export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = el("div", { className: `toast ${type}`, textContent: message });
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("fade-out");
    toast.addEventListener("animationend", () => toast.remove());
  }, 4000);
}

// === Content Empty State ===

export function showContentEmpty(show) {
  const el = document.getElementById("content-empty");
  if (el) el.classList.toggle("hidden", !show);
}

export function showStreamsContainer(show) {
  const el = document.getElementById("streams-container");
  if (el) el.classList.toggle("hidden", !show);
}

// === Password Visibility Toggle ===

export function initPasswordToggles() {
  document.querySelectorAll(".toggle-visibility").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.parentElement.querySelector("input");
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      btn.querySelector(".eye-icon").classList.toggle("hidden", isPassword);
      btn.querySelector(".eye-off-icon").classList.toggle("hidden", !isPassword);
      btn.setAttribute("aria-label", isPassword ? "Hide API key" : "Show API key");
    });
  });
}
