import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installLocalStorage, installDOM } from "./helpers.js";

let ui;
let dom;

describe("ui", () => {
  beforeEach(async () => {
    installLocalStorage();
    dom = installDOM();
    ui = await import(`../js/ui.js?t=${Date.now()}_${Math.random()}`);
  });

  describe("renderChannelList", () => {
    const channels = [
      {
        id: "UC1",
        handle: "@chan1",
        title: "Channel 1",
        thumbnailUrl: "https://img/1.jpg",
      },
      {
        id: "UC2",
        handle: "@chan2",
        title: "Channel 2",
        thumbnailUrl: "https://img/2.jpg",
      },
    ];

    it("renders channel items into the list", () => {
      ui.renderChannelList(channels, null, {
        onSelect: () => {},
        onRemove: () => {},
      });
      const list = dom.elements.get("channel-list");
      assert.equal(list.children.length, 2);
    });

    it("marks selected channel as active", () => {
      ui.renderChannelList(channels, "UC1", {
        onSelect: () => {},
        onRemove: () => {},
      });
      const list = dom.elements.get("channel-list");
      assert.ok(list.children[0].className.includes("active"));
      assert.ok(!list.children[1].className.includes("active"));
    });

    it("shows empty hint when no channels", () => {
      ui.renderChannelList([], null, {
        onSelect: () => {},
        onRemove: () => {},
      });
      const hint = dom.elements.get("channel-empty");
      assert.ok(!hint.classList._classes.has("hidden"));
    });

    it("hides empty hint when channels exist", () => {
      ui.renderChannelList(channels, null, {
        onSelect: () => {},
        onRemove: () => {},
      });
      const hint = dom.elements.get("channel-empty");
      assert.ok(hint.classList._classes.has("hidden"));
    });

    it("calls onSelect when channel item is clicked", () => {
      let selectedId = null;
      ui.renderChannelList(channels, null, {
        onSelect: (id) => {
          selectedId = id;
        },
        onRemove: () => {},
      });
      const list = dom.elements.get("channel-list");
      // Trigger click listener on first item
      const item = list.children[0];
      const clickHandlers = item._listeners["click"] || [];
      clickHandlers.forEach((h) => h());
      assert.equal(selectedId, "UC1");
    });

    it("calls onRemove when remove button is clicked", () => {
      let removedId = null;
      ui.renderChannelList(channels, null, {
        onSelect: () => {},
        onRemove: (id) => {
          removedId = id;
        },
      });
      const list = dom.elements.get("channel-list");
      const item = list.children[0];
      // Remove button is the last child of the channel item
      const removeBtn = item.children[item.children.length - 1];
      const clickHandlers = removeBtn._listeners["click"] || [];
      clickHandlers.forEach((h) => h({ stopPropagation: () => {} }));
      assert.equal(removedId, "UC1");
    });
  });

  describe("renderStreams", () => {
    const streams = [
      {
        videoId: "v1",
        title: "Live Stream",
        channelTitle: "Ch1",
        thumbnailUrl: "https://img/t1.jpg",
        eventType: "live",
        concurrentViewers: "2500",
      },
      {
        videoId: "v2",
        title: "Upcoming Stream",
        channelTitle: "Ch2",
        thumbnailUrl: "https://img/t2.jpg",
        eventType: "upcoming",
        scheduledStartTime: new Date(Date.now() + 30 * 60000).toISOString(),
      },
      {
        videoId: "v3",
        title: "Recent Stream",
        channelTitle: "Ch3",
        thumbnailUrl: "https://img/t3.jpg",
        eventType: "completed",
        actualStartTime: new Date(Date.now() - 3600000).toISOString(),
      },
    ];

    it("renders stream cards", () => {
      ui.renderStreams("live-streams", streams, () => {});
      const container = dom.elements.get("live-streams");
      assert.equal(container.children.length, 3);
    });

    it("shows empty state when no streams", () => {
      ui.renderStreams("live-streams", [], () => {});
      const container = dom.elements.get("live-streams");
      assert.equal(container.children.length, 1);
      assert.ok(container.children[0].className.includes("stream-empty"));
    });

    it("calls onClick with videoId when card is clicked", () => {
      let clicked = null;
      ui.renderStreams("live-streams", [streams[0]], (id) => {
        clicked = id;
      });
      const container = dom.elements.get("live-streams");
      const card = container.children[0];
      const handlers = card._listeners["click"] || [];
      handlers.forEach((h) => h());
      assert.equal(clicked, "v1");
    });

    it("creates live badge for live streams", () => {
      ui.renderStreams("live-streams", [streams[0]], () => {});
      const container = dom.elements.get("live-streams");
      const card = container.children[0];
      // Card > thumbnail-wrapper > should contain live-badge
      const thumbWrapper = card.children[0];
      const badges = thumbWrapper.children.filter(
        (c) => c.className === "live-badge",
      );
      assert.equal(badges.length, 1);
      assert.equal(badges[0].textContent, "LIVE");
    });

    it("creates scheduled badge for upcoming streams", () => {
      ui.renderStreams("upcoming-streams", [streams[1]], () => {});
      const container = dom.elements.get("upcoming-streams");
      const card = container.children[0];
      const thumbWrapper = card.children[0];
      const badges = thumbWrapper.children.filter(
        (c) => c.className === "scheduled-badge",
      );
      assert.equal(badges.length, 1);
    });
  });

  describe("renderLoadingState", () => {
    it("renders skeleton cards", () => {
      ui.renderLoadingState("live-streams");
      const container = dom.elements.get("live-streams");
      assert.equal(container.children.length, 3);
      assert.ok(container.children[0].className.includes("skeleton-card"));
    });
  });

  describe("renderEmptyState", () => {
    it("renders a message", () => {
      ui.renderEmptyState("live-streams", "No streams found.");
      const container = dom.elements.get("live-streams");
      assert.equal(container.children.length, 1);
      assert.equal(container.children[0].textContent, "No streams found.");
    });
  });

  describe("showPlayer / hidePlayer", () => {
    it("shows player with correct video URL", () => {
      ui.showPlayer("abc123");
      const iframe = dom.elements.get("player");
      assert.ok(iframe.src.includes("abc123"));
      const link = dom.elements.get("open-youtube");
      assert.ok(link.href.includes("abc123"));
      const area = dom.elements.get("player-area");
      assert.ok(!area.classList._classes.has("hidden"));
    });

    it("hides player and clears src", () => {
      ui.showPlayer("abc123");
      ui.hidePlayer();
      const iframe = dom.elements.get("player");
      assert.equal(iframe.src, "");
      const area = dom.elements.get("player-area");
      assert.ok(area.classList._classes.has("hidden"));
    });
  });

  describe("updateQuotaDisplay", () => {
    it("displays quota values", () => {
      ui.updateQuotaDisplay(500, 10000);
      const el = dom.elements.get("quota-display");
      assert.equal(el.textContent, "500 / 10,000");
    });

    it("adds warning class at 50%", () => {
      ui.updateQuotaDisplay(5000, 10000);
      const el = dom.elements.get("quota-display");
      assert.ok(el.classList._classes.has("warning"));
    });

    it("adds danger class at 80%", () => {
      ui.updateQuotaDisplay(8000, 10000);
      const el = dom.elements.get("quota-display");
      assert.ok(el.classList._classes.has("danger"));
    });
  });

  describe("showToast", () => {
    it("creates a toast element in the container", () => {
      ui.showToast("Test message", "info");
      const container = dom.elements.get("toast-container");
      assert.equal(container.children.length, 1);
      assert.ok(container.children[0].className.includes("toast"));
      assert.ok(container.children[0].className.includes("info"));
    });

    it("creates multiple toasts", () => {
      ui.showToast("Message 1", "info");
      ui.showToast("Message 2", "error");
      const container = dom.elements.get("toast-container");
      assert.equal(container.children.length, 2);
    });
  });

  describe("showContentEmpty / showStreamsContainer", () => {
    it("toggles content-empty visibility", () => {
      ui.showContentEmpty(true);
      assert.ok(
        !dom.elements.get("content-empty").classList._classes.has("hidden"),
      );
      ui.showContentEmpty(false);
      assert.ok(
        dom.elements.get("content-empty").classList._classes.has("hidden"),
      );
    });

    it("toggles streams-container visibility", () => {
      ui.showStreamsContainer(false);
      assert.ok(
        dom.elements.get("streams-container").classList._classes.has("hidden"),
      );
      ui.showStreamsContainer(true);
      assert.ok(
        !dom.elements.get("streams-container").classList._classes.has("hidden"),
      );
    });
  });
});
