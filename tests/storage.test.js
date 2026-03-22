import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorage } from './helpers.js';

let storage;
let mockLS;

describe('storage', () => {
  beforeEach(async () => {
    mockLS = installLocalStorage();
    // Re-import fresh module each time by busting cache
    storage = await import(`../js/storage.js?t=${Date.now()}_${Math.random()}`);
  });

  describe('API Key', () => {
    it('returns null when no API key is set', () => {
      assert.equal(storage.getApiKey(), null);
    });

    it('stores and retrieves API key', () => {
      storage.setApiKey('test-key-123');
      assert.equal(storage.getApiKey(), 'test-key-123');
    });

    it('overwrites existing API key', () => {
      storage.setApiKey('key-1');
      storage.setApiKey('key-2');
      assert.equal(storage.getApiKey(), 'key-2');
    });
  });

  describe('Channels', () => {
    const channel1 = { id: 'UC1', handle: '@test1', title: 'Test 1', thumbnailUrl: '' };
    const channel2 = { id: 'UC2', handle: '@test2', title: 'Test 2', thumbnailUrl: '' };

    it('returns empty array when no channels exist', () => {
      assert.deepEqual(storage.getChannels(), []);
    });

    it('adds a channel', () => {
      const result = storage.addChannel(channel1);
      assert.equal(result, true);
      assert.deepEqual(storage.getChannels(), [channel1]);
    });

    it('prevents duplicate channels', () => {
      storage.addChannel(channel1);
      const result = storage.addChannel(channel1);
      assert.equal(result, false);
      assert.equal(storage.getChannels().length, 1);
    });

    it('adds multiple channels', () => {
      storage.addChannel(channel1);
      storage.addChannel(channel2);
      assert.equal(storage.getChannels().length, 2);
    });

    it('removes a channel by id', () => {
      storage.addChannel(channel1);
      storage.addChannel(channel2);
      storage.removeChannel('UC1');
      const channels = storage.getChannels();
      assert.equal(channels.length, 1);
      assert.equal(channels[0].id, 'UC2');
    });

    it('clears cache entries when removing a channel', () => {
      storage.addChannel(channel1);
      storage.cacheSet(`search:live:UC1`, [{ test: true }], 3600);
      storage.removeChannel('UC1');
      assert.equal(storage.cacheGet(`search:live:UC1`), null);
    });
  });

  describe('TTL Cache', () => {
    it('returns null for missing cache key', () => {
      assert.equal(storage.cacheGet('nonexistent'), null);
    });

    it('stores and retrieves cached data', () => {
      storage.cacheSet('test-key', { hello: 'world' }, 3600);
      assert.deepEqual(storage.cacheGet('test-key'), { hello: 'world' });
    });

    it('returns null for expired cache entry', () => {
      // Set with 0 TTL (already expired)
      storage.cacheSet('expired', { data: true }, 0);
      // Manually set expiresAt to the past
      const raw = JSON.parse(mockLS.getItem('lh_cache:expired'));
      raw.expiresAt = Date.now() - 1000;
      mockLS.setItem('lh_cache:expired', JSON.stringify(raw));
      assert.equal(storage.cacheGet('expired'), null);
    });

    it('clearCache removes all cache entries but not other data', () => {
      storage.setApiKey('my-key');
      storage.cacheSet('data1', 'a', 3600);
      storage.cacheSet('data2', 'b', 3600);
      storage.clearCache();
      assert.equal(storage.cacheGet('data1'), null);
      assert.equal(storage.cacheGet('data2'), null);
      assert.equal(storage.getApiKey(), 'my-key'); // preserved
    });
  });

  describe('Settings', () => {
    it('returns default settings', () => {
      const settings = storage.getSettings();
      assert.equal(settings.refreshInterval, 15);
    });

    it('stores and retrieves settings', () => {
      storage.setSettings({ refreshInterval: 30 });
      assert.equal(storage.getSettings().refreshInterval, 30);
    });
  });

  describe('Quota Tracking', () => {
    it('returns zero usage for a new day', () => {
      const usage = storage.getQuotaUsage();
      assert.equal(usage.used, 0);
      assert.equal(usage.date, new Date().toISOString().slice(0, 10));
    });

    it('accumulates quota usage', () => {
      storage.addQuotaUsage(100);
      storage.addQuotaUsage(50);
      assert.equal(storage.getQuotaUsage().used, 150);
    });

    it('resets quota on a new day', () => {
      // Simulate a previous day's usage
      mockLS.setItem('lh_quota', JSON.stringify({
        date: '2020-01-01',
        used: 5000
      }));
      const usage = storage.getQuotaUsage();
      assert.equal(usage.used, 0);
    });
  });
});
