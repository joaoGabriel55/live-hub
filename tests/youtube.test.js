import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorage, installFetch, mockResponse } from './helpers.js';

let youtube;
let storage;
let fetchCalls;

describe('youtube', () => {
  beforeEach(async () => {
    installLocalStorage();
    fetchCalls = [];

    installFetch((url) => {
      fetchCalls.push(url);

      // Route based on endpoint
      if (url.includes('/channels?')) {
        if (url.includes('forHandle=TestChannel')) {
          return mockResponse({
            items: [{
              id: 'UC_TEST',
              snippet: {
                title: 'Test Channel',
                thumbnails: { default: { url: 'https://img.test/avatar.jpg' } }
              }
            }]
          });
        }
        // Validate API key call
        if (url.includes('forHandle=Google')) {
          return mockResponse({ items: [{ id: 'UC_GOOGLE' }] });
        }
        return mockResponse({ items: [] });
      }

      if (url.includes('/search?')) {
        if (url.includes('type=channel')) {
          return mockResponse({
            items: [{
              snippet: {
                channelId: 'UC_SEARCH',
                channelTitle: 'Search Result',
                thumbnails: { default: { url: 'https://img.test/search.jpg' } }
              }
            }]
          });
        }

        // Stream search
        const eventMatch = url.match(/eventType=(\w+)/);
        const eventType = eventMatch ? eventMatch[1] : 'live';
        return mockResponse({
          items: [{
            id: { videoId: `vid_${eventType}_1` },
            snippet: {
              title: `${eventType} Stream 1`,
              channelTitle: 'Test Channel',
              thumbnails: { medium: { url: 'https://img.test/thumb.jpg' } },
              publishedAt: '2025-01-01T00:00:00Z'
            }
          }, {
            id: { videoId: `vid_${eventType}_2` },
            snippet: {
              title: `${eventType} Stream 2`,
              channelTitle: 'Test Channel',
              thumbnails: { medium: { url: 'https://img.test/thumb2.jpg' } },
              publishedAt: '2025-01-02T00:00:00Z'
            }
          }]
        });
      }

      if (url.includes('/videos?')) {
        const idMatch = url.match(/id=([^&]+)/);
        const ids = idMatch ? decodeURIComponent(idMatch[1]).split(',') : [];
        return mockResponse({
          items: ids.map(id => ({
            id,
            snippet: {
              title: `Video ${id}`,
              channelTitle: 'Test Channel',
              thumbnails: { medium: { url: 'https://img.test/vid.jpg' } }
            },
            liveStreamingDetails: {
              concurrentViewers: '1500',
              scheduledStartTime: '2025-06-01T18:00:00Z',
              actualStartTime: '2025-06-01T18:02:00Z',
              actualEndTime: null
            }
          }))
        });
      }

      return mockResponse({}, 404);
    });

    const ts = `${Date.now()}_${Math.random()}`;
    storage = await import(`../js/storage.js?t=${ts}`);
    storage.setApiKey('AIza_TEST_KEY');
    youtube = await import(`../js/youtube.js?t=${ts}`);
  });

  describe('validateApiKey', () => {
    it('returns true for valid key', async () => {
      const result = await youtube.validateApiKey('AIza_VALID');
      assert.equal(result, true);
    });

    it('returns false for invalid key', async () => {
      installFetch(() => mockResponse({}, 401));
      const result = await youtube.validateApiKey('BAD_KEY');
      assert.equal(result, false);
    });
  });

  describe('resolveChannel', () => {
    it('resolves channel by handle', async () => {
      const ch = await youtube.resolveChannel('@TestChannel');
      assert.equal(ch.id, 'UC_TEST');
      assert.equal(ch.title, 'Test Channel');
      assert.equal(ch.handle, '@TestChannel');
    });

    it('adds @ prefix if missing', async () => {
      const ch = await youtube.resolveChannel('TestChannel');
      assert.equal(ch.id, 'UC_TEST');
      assert.equal(ch.handle, '@TestChannel');
    });

    it('falls back to search when handle not found', async () => {
      const ch = await youtube.resolveChannel('Unknown Channel Name');
      assert.equal(ch.id, 'UC_SEARCH');
      assert.equal(ch.title, 'Search Result');
    });

    it('returns null for empty input', async () => {
      const ch = await youtube.resolveChannel('');
      assert.equal(ch, null);
    });

    it('caches resolved channels', async () => {
      await youtube.resolveChannel('@TestChannel');
      const callCount = fetchCalls.length;
      await youtube.resolveChannel('@TestChannel');
      assert.equal(fetchCalls.length, callCount); // no additional fetch
    });
  });

  describe('fetchLiveStreams', () => {
    it('returns live streams for a channel', async () => {
      const streams = await youtube.fetchLiveStreams('UC_TEST');
      assert.equal(streams.length, 2);
      assert.equal(streams[0].videoId, 'vid_live_1');
      assert.equal(streams[0].eventType, 'live');
    });

    it('caches results', async () => {
      await youtube.fetchLiveStreams('UC_TEST');
      const callCount = fetchCalls.length;
      await youtube.fetchLiveStreams('UC_TEST');
      assert.equal(fetchCalls.length, callCount);
    });
  });

  describe('fetchUpcomingStreams', () => {
    it('returns upcoming streams', async () => {
      const streams = await youtube.fetchUpcomingStreams('UC_TEST');
      assert.equal(streams.length, 2);
      assert.equal(streams[0].eventType, 'upcoming');
    });
  });

  describe('fetchCompletedStreams', () => {
    it('returns completed streams', async () => {
      const streams = await youtube.fetchCompletedStreams('UC_TEST');
      assert.equal(streams.length, 2);
      assert.equal(streams[0].eventType, 'completed');
    });
  });

  describe('fetchVideoDetails', () => {
    it('returns enriched video details', async () => {
      const details = await youtube.fetchVideoDetails(['vid1', 'vid2']);
      assert.ok(details.length >= 1);
      const detail = details.find(d => d.videoId === 'vid1');
      assert.ok(detail);
      assert.equal(detail.concurrentViewers, '1500');
      assert.equal(detail.scheduledStartTime, '2025-06-01T18:00:00Z');
    });

    it('returns empty array for empty input', async () => {
      const details = await youtube.fetchVideoDetails([]);
      assert.deepEqual(details, []);
    });

    it('caches video details individually', async () => {
      await youtube.fetchVideoDetails(['vid1']);
      const callCount = fetchCalls.length;
      await youtube.fetchVideoDetails(['vid1']);
      assert.equal(fetchCalls.length, callCount);
    });
  });

  describe('fetchAllStreams', () => {
    it('returns live, upcoming, and completed streams', async () => {
      const result = await youtube.fetchAllStreams('UC_TEST');
      assert.ok(Array.isArray(result.live));
      assert.ok(Array.isArray(result.upcoming));
      assert.ok(Array.isArray(result.completed));
      assert.equal(result.live.length, 2);
      assert.equal(result.upcoming.length, 2);
      assert.equal(result.completed.length, 2);
    });

    it('enriches streams with video details', async () => {
      const result = await youtube.fetchAllStreams('UC_TEST');
      // Should have liveStreamingDetails merged
      assert.ok(result.live[0].concurrentViewers);
    });
  });

  describe('Quota', () => {
    it('getQuotaInfo returns usage and limit', () => {
      const info = youtube.getQuotaInfo();
      assert.equal(typeof info.used, 'number');
      assert.equal(info.limit, 10000);
    });

    it('isQuotaSafe returns true when under 80%', () => {
      assert.equal(youtube.isQuotaSafe(), true);
    });

    it('tracks quota usage from API calls', async () => {
      const before = youtube.getQuotaInfo().used;
      await youtube.fetchLiveStreams('UC_NEW_CHANNEL');
      const after = youtube.getQuotaInfo().used;
      assert.ok(after > before);
    });

    it('throws when daily quota exceeded', async () => {
      // Set quota to max
      for (let i = 0; i < 100; i++) storage.addQuotaUsage(100);
      await assert.rejects(
        () => youtube.fetchLiveStreams('UC_OVER_QUOTA'),
        { message: 'Daily API quota exceeded' }
      );
    });
  });
});
