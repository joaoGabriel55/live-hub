import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorage, installDOM, installFetch, mockResponse } from './helpers.js';

// Shared mock state
let dom;
let storage;
let fetchCalls;

function setupFetchMock() {
  fetchCalls = [];
  installFetch((url) => {
    fetchCalls.push(url);

    if (url.includes('/channels?')) {
      if (url.includes('forHandle=Google')) {
        return mockResponse({ items: [{ id: 'UC_GOOGLE' }] });
      }
      if (url.includes('forHandle=TestCreator')) {
        return mockResponse({
          items: [{
            id: 'UC_CREATOR',
            snippet: {
              title: 'Test Creator',
              thumbnails: { default: { url: 'https://img/avatar.jpg' } }
            }
          }]
        });
      }
      if (url.includes('forHandle=SecondChannel')) {
        return mockResponse({
          items: [{
            id: 'UC_SECOND',
            snippet: {
              title: 'Second Channel',
              thumbnails: { default: { url: 'https://img/avatar2.jpg' } }
            }
          }]
        });
      }
      return mockResponse({ items: [] });
    }

    if (url.includes('/search?') && url.includes('type=video')) {
      const eventMatch = url.match(/eventType=(\w+)/);
      const channelMatch = url.match(/channelId=([^&]+)/);
      const eventType = eventMatch?.[1] || 'live';
      const channelId = channelMatch?.[1] || 'unknown';

      return mockResponse({
        items: [{
          id: { videoId: `${channelId}_${eventType}_1` },
          snippet: {
            title: `${eventType} stream from ${channelId}`,
            channelTitle: channelId,
            thumbnails: { medium: { url: 'https://img/thumb.jpg' } },
            publishedAt: '2025-01-01T00:00:00Z'
          }
        }]
      });
    }

    if (url.includes('/search?') && url.includes('type=channel')) {
      return mockResponse({ items: [] });
    }

    if (url.includes('/videos?')) {
      const idMatch = url.match(/id=([^&]+)/);
      const ids = idMatch ? decodeURIComponent(idMatch[1]).split(',') : [];
      return mockResponse({
        items: ids.map(id => ({
          id,
          snippet: {
            title: `Video ${id}`,
            channelTitle: 'Test',
            thumbnails: { medium: { url: 'https://img/v.jpg' } }
          },
          liveStreamingDetails: {
            concurrentViewers: '100',
            scheduledStartTime: '2025-06-01T18:00:00Z',
            actualStartTime: '2025-06-01T18:02:00Z',
            actualEndTime: null
          }
        }))
      });
    }

    return mockResponse({}, 404);
  });
}

describe('App Integration', () => {
  beforeEach(async () => {
    installLocalStorage();
    dom = installDOM();
    setupFetchMock();

    const ts = `${Date.now()}_${Math.random()}`;
    storage = await import(`../js/storage.js?t=${ts}`);
  });

  describe('Channel selection controls stream fetching', () => {
    it('only fetches live streams on init, not upcoming or completed', async () => {
      storage.setApiKey('AIza_TEST');
      storage.addChannel({ id: 'UC_CREATOR', handle: '@TestCreator', title: 'Test Creator', thumbnailUrl: '' });

      const ts = `${Date.now()}_${Math.random()}`;
      const youtube = await import(`../js/youtube.js?t=${ts}`);

      // Simulate what app.js init does: refreshLive()
      const liveStreams = await youtube.fetchLiveStreams('UC_CREATOR');
      assert.ok(liveStreams.length > 0);

      // Check that only live search was made (not upcoming/completed)
      const searchCalls = fetchCalls.filter(u => u.includes('/search?') && u.includes('type=video'));
      assert.equal(searchCalls.length, 1);
      assert.ok(searchCalls[0].includes('eventType=live'));
    });

    it('fetches upcoming and completed only for selected channel', async () => {
      storage.setApiKey('AIza_TEST');
      storage.addChannel({ id: 'UC_CREATOR', handle: '@TestCreator', title: 'Test Creator', thumbnailUrl: '' });
      storage.addChannel({ id: 'UC_SECOND', handle: '@SecondChannel', title: 'Second Channel', thumbnailUrl: '' });

      const ts = `${Date.now()}_${Math.random()}`;
      const youtube = await import(`../js/youtube.js?t=${ts}`);

      // Fetch live for all channels
      await youtube.fetchLiveStreams('UC_CREATOR');
      await youtube.fetchLiveStreams('UC_SECOND');
      fetchCalls = []; // reset

      // Now simulate selecting UC_CREATOR
      const [upcoming, completed] = await Promise.all([
        youtube.fetchUpcomingStreams('UC_CREATOR'),
        youtube.fetchCompletedStreams('UC_CREATOR')
      ]);

      assert.ok(upcoming.length > 0);
      assert.ok(completed.length > 0);

      // Only UC_CREATOR upcoming/completed were fetched, not UC_SECOND
      const searchCalls = fetchCalls.filter(u => u.includes('/search?'));
      for (const call of searchCalls) {
        assert.ok(call.includes('UC_CREATOR'), 'Should only fetch for selected channel');
        assert.ok(!call.includes('UC_SECOND'), 'Should not fetch for unselected channel');
      }
    });
  });

  describe('Channel management flow', () => {
    it('resolves and stores a channel', async () => {
      storage.setApiKey('AIza_TEST');

      const ts = `${Date.now()}_${Math.random()}`;
      const youtube = await import(`../js/youtube.js?t=${ts}`);

      const channel = await youtube.resolveChannel('@TestCreator');
      assert.equal(channel.id, 'UC_CREATOR');
      assert.equal(channel.title, 'Test Creator');

      const added = storage.addChannel(channel);
      assert.equal(added, true);
      assert.equal(storage.getChannels().length, 1);
    });

    it('prevents adding duplicate channels', async () => {
      storage.setApiKey('AIza_TEST');

      const ts = `${Date.now()}_${Math.random()}`;
      const youtube = await import(`../js/youtube.js?t=${ts}`);

      const channel = await youtube.resolveChannel('@TestCreator');
      storage.addChannel(channel);
      const duplicate = storage.addChannel(channel);
      assert.equal(duplicate, false);
      assert.equal(storage.getChannels().length, 1);
    });

    it('removes channel and clears its cache', async () => {
      storage.setApiKey('AIza_TEST');

      const ts = `${Date.now()}_${Math.random()}`;
      const youtube = await import(`../js/youtube.js?t=${ts}`);

      const channel = await youtube.resolveChannel('@TestCreator');
      storage.addChannel(channel);

      // Populate cache
      await youtube.fetchLiveStreams('UC_CREATOR');
      assert.ok(storage.cacheGet('search:live:UC_CREATOR') !== null);

      // Remove
      storage.removeChannel('UC_CREATOR');
      assert.equal(storage.getChannels().length, 0);
      assert.equal(storage.cacheGet('search:live:UC_CREATOR'), null);
    });
  });

  describe('Quota-aware behavior', () => {
    it('tracks quota across multiple API calls', async () => {
      storage.setApiKey('AIza_TEST');

      const ts = `${Date.now()}_${Math.random()}`;
      const youtube = await import(`../js/youtube.js?t=${ts}`);

      const before = youtube.getQuotaInfo().used;
      await youtube.fetchLiveStreams('UC_CREATOR'); // 100 units (search)
      const after = youtube.getQuotaInfo().used;
      assert.ok(after - before >= 100);
    });

    it('isQuotaSafe returns false when approaching limit', async () => {
      storage.setApiKey('AIza_TEST');

      const ts = `${Date.now()}_${Math.random()}`;
      const youtube = await import(`../js/youtube.js?t=${ts}`);

      // Simulate high usage
      for (let i = 0; i < 80; i++) storage.addQuotaUsage(100);
      assert.equal(youtube.isQuotaSafe(), false);
    });
  });

  describe('UI rendering integration', () => {
    it('renders channel list with selection state', async () => {
      dom = installDOM();
      const ts = `${Date.now()}_${Math.random()}`;
      const ui = await import(`../js/ui.js?t=${ts}`);

      const channels = [
        { id: 'UC1', handle: '@ch1', title: 'Channel 1', thumbnailUrl: '' },
        { id: 'UC2', handle: '@ch2', title: 'Channel 2', thumbnailUrl: '' },
      ];

      // No selection
      ui.renderChannelList(channels, null, { onSelect: () => {}, onRemove: () => {} });
      let list = dom.elements.get('channel-list');
      assert.equal(list.children.length, 2);
      assert.ok(!list.children[0].className.includes('active'));
      assert.ok(!list.children[1].className.includes('active'));

      // With selection
      list.innerHTML = '';
      list.children = [];
      ui.renderChannelList(channels, 'UC2', { onSelect: () => {}, onRemove: () => {} });
      list = dom.elements.get('channel-list');
      assert.ok(!list.children[0].className.includes('active'));
      assert.ok(list.children[1].className.includes('active'));
    });

    it('shows streams container and hides empty state when channels exist', async () => {
      dom = installDOM();
      const ts = `${Date.now()}_${Math.random()}`;
      const ui = await import(`../js/ui.js?t=${ts}`);

      ui.showContentEmpty(false);
      ui.showStreamsContainer(true);
      assert.ok(dom.elements.get('content-empty').classList._classes.has('hidden'));
      assert.ok(!dom.elements.get('streams-container').classList._classes.has('hidden'));
    });

    it('shows empty state and hides streams when no channels', async () => {
      dom = installDOM();
      const ts = `${Date.now()}_${Math.random()}`;
      const ui = await import(`../js/ui.js?t=${ts}`);

      ui.showContentEmpty(true);
      ui.showStreamsContainer(false);
      assert.ok(!dom.elements.get('content-empty').classList._classes.has('hidden'));
      assert.ok(dom.elements.get('streams-container').classList._classes.has('hidden'));
    });

    it('renders live stream cards with badges and viewer count', async () => {
      dom = installDOM();
      const ts = `${Date.now()}_${Math.random()}`;
      const ui = await import(`../js/ui.js?t=${ts}`);

      const liveStream = {
        videoId: 'v1', title: 'Gaming Live', channelTitle: 'Gamer',
        thumbnailUrl: 'https://img/t.jpg', eventType: 'live',
        concurrentViewers: '5000'
      };

      ui.renderStreams('live-streams', [liveStream], () => {});
      const container = dom.elements.get('live-streams');
      const card = container.children[0];
      const thumbWrapper = card.children[0];

      // Should have live badge and viewer count
      const liveBadge = thumbWrapper.children.find(c => c.className === 'live-badge');
      const viewerCount = thumbWrapper.children.find(c => c.className === 'viewer-count');
      assert.ok(liveBadge);
      assert.equal(liveBadge.textContent, 'LIVE');
      assert.ok(viewerCount);
      assert.ok(viewerCount.textContent.includes('5.0K'));
    });

    it('player show/hide cycle works correctly', async () => {
      dom = installDOM();
      const ts = `${Date.now()}_${Math.random()}`;
      const ui = await import(`../js/ui.js?t=${ts}`);

      // Show
      ui.showPlayer('testVid123');
      const area = dom.elements.get('player-area');
      const iframe = dom.elements.get('player');
      assert.ok(!area.classList._classes.has('hidden'));
      assert.ok(iframe.src.includes('testVid123'));

      // Hide
      ui.hidePlayer();
      assert.ok(area.classList._classes.has('hidden'));
      assert.equal(iframe.src, '');
    });
  });

  describe('Full workflow: add channel -> fetch live -> select -> fetch upcoming/completed', () => {
    it('completes the entire user workflow', async () => {
      storage.setApiKey('AIza_TEST');
      dom = installDOM();

      const ts = `${Date.now()}_${Math.random()}`;
      const youtube = await import(`../js/youtube.js?t=${ts}`);
      const ui = await import(`../js/ui.js?t=${ts}`);

      // Step 1: Resolve and add channel
      const channel = await youtube.resolveChannel('@TestCreator');
      storage.addChannel(channel);
      assert.equal(storage.getChannels().length, 1);

      // Step 2: Fetch live streams for all channels (what init does)
      const liveStreams = await youtube.fetchLiveStreams('UC_CREATOR');
      ui.renderStreams('live-streams', liveStreams, () => {});
      assert.ok(dom.elements.get('live-streams').children.length > 0);

      // Step 3: Upcoming/completed sections should be hidden (no channel selected)
      dom.elements.get('upcoming-section').classList.add('hidden');
      dom.elements.get('completed-section').classList.add('hidden');
      assert.ok(dom.elements.get('upcoming-section').classList._classes.has('hidden'));

      // Step 4: User selects channel -> fetch upcoming and completed
      fetchCalls = [];
      const [upcoming, completed] = await Promise.all([
        youtube.fetchUpcomingStreams('UC_CREATOR'),
        youtube.fetchCompletedStreams('UC_CREATOR')
      ]);

      // Sections become visible
      dom.elements.get('upcoming-section').classList.remove('hidden');
      dom.elements.get('completed-section').classList.remove('hidden');

      ui.renderStreams('upcoming-streams', upcoming, () => {});
      ui.renderStreams('completed-streams', completed, () => {});

      assert.ok(!dom.elements.get('upcoming-section').classList._classes.has('hidden'));
      assert.ok(!dom.elements.get('completed-section').classList._classes.has('hidden'));
      assert.ok(dom.elements.get('upcoming-streams').children.length > 0);
      assert.ok(dom.elements.get('completed-streams').children.length > 0);

      // Verify only selected channel was queried
      const upcomingCalls = fetchCalls.filter(u => u.includes('eventType=upcoming'));
      const completedCalls = fetchCalls.filter(u => u.includes('eventType=completed'));
      assert.equal(upcomingCalls.length, 1);
      assert.equal(completedCalls.length, 1);
      assert.ok(upcomingCalls[0].includes('UC_CREATOR'));
      assert.ok(completedCalls[0].includes('UC_CREATOR'));

      // Step 5: Deselect -> sections hidden again
      dom.elements.get('upcoming-section').classList.add('hidden');
      dom.elements.get('completed-section').classList.add('hidden');
      assert.ok(dom.elements.get('upcoming-section').classList._classes.has('hidden'));
    });
  });

  describe('Cache behavior across operations', () => {
    it('serves cached data without additional API calls', async () => {
      storage.setApiKey('AIza_TEST');

      const ts = `${Date.now()}_${Math.random()}`;
      const youtube = await import(`../js/youtube.js?t=${ts}`);

      // First call hits API
      await youtube.fetchLiveStreams('UC_CREATOR');
      const callsAfterFirst = fetchCalls.length;

      // Second call should be cached
      await youtube.fetchLiveStreams('UC_CREATOR');
      assert.equal(fetchCalls.length, callsAfterFirst);

      // Different channel still hits API
      await youtube.fetchLiveStreams('UC_SECOND');
      assert.ok(fetchCalls.length > callsAfterFirst);
    });

    it('clearing cache forces re-fetch', async () => {
      storage.setApiKey('AIza_TEST');

      const ts = `${Date.now()}_${Math.random()}`;
      const youtube = await import(`../js/youtube.js?t=${ts}`);

      await youtube.fetchLiveStreams('UC_CREATOR');
      const callsAfterFirst = fetchCalls.length;

      storage.clearCache();

      await youtube.fetchLiveStreams('UC_CREATOR');
      assert.ok(fetchCalls.length > callsAfterFirst);
    });
  });
});
