import { cacheGet, cacheSet, getApiKey, addQuotaUsage, getQuotaUsage } from './storage.js';

const BASE = 'https://www.googleapis.com/youtube/v3';

const TTL = {
  live: 120,
  upcoming: 300,
  completed: 1800,
  channel: 86400 * 365,
  video: 300
};

const QUOTA_LIMIT = 10000;

// Internal API call wrapper

async function apiCall(endpoint, params, quotaCost) {
  const key = getApiKey();
  if (!key) throw new Error('API key not configured');

  const usage = getQuotaUsage();
  if (usage.used >= QUOTA_LIMIT) {
    throw new Error('Daily API quota exceeded');
  }

  const url = new URL(`${BASE}/${endpoint}`);
  params.key = key;
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason || '';
    if (res.status === 401) throw new Error('Invalid API key');
    if (res.status === 403 && reason === 'quotaExceeded') {
      throw new Error('Daily API quota exceeded');
    }
    throw new Error(`YouTube API error: ${res.status} ${reason || res.statusText}`);
  }

  addQuotaUsage(quotaCost);
  return res.json();
}

// Channel resolution

export async function resolveChannel(input) {
  const cleaned = input.trim();
  if (!cleaned) return null;

  // Try handle-based resolution first (cheap: 1 unit)
  const handle = cleaned.startsWith('@') ? cleaned : `@${cleaned}`;
  const cacheKey = `channel:${handle.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const data = await apiCall('channels', {
      part: 'snippet',
      forHandle: handle.replace('@', ''),
      maxResults: 1
    }, 1);

    if (data.items?.length) {
      const ch = data.items[0];
      const channel = {
        id: ch.id,
        handle: handle,
        title: ch.snippet.title,
        thumbnailUrl: ch.snippet.thumbnails?.default?.url || ''
      };
      cacheSet(cacheKey, channel, TTL.channel);
      return channel;
    }
  } catch (e) {
    if (e.message.includes('API key') || e.message.includes('quota')) throw e;
  }

  // Fallback: search by name (expensive: 100 units)
  const searchKey = `channel-search:${cleaned.toLowerCase()}`;
  const searchCached = cacheGet(searchKey);
  if (searchCached) return searchCached;

  const data = await apiCall('search', {
    part: 'snippet',
    q: cleaned,
    type: 'channel',
    maxResults: 1
  }, 100);

  if (!data.items?.length) return null;

  const item = data.items[0];
  const channel = {
    id: item.snippet.channelId,
    handle: cleaned,
    title: item.snippet.channelTitle,
    thumbnailUrl: item.snippet.thumbnails?.default?.url || ''
  };
  cacheSet(searchKey, channel, TTL.channel);
  return channel;
}

// Stream fetching

async function fetchStreams(channelId, eventType) {
  const cacheKey = `search:${eventType}:${channelId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const data = await apiCall('search', {
    part: 'snippet',
    channelId,
    eventType,
    type: 'video',
    order: 'date',
    maxResults: 10
  }, 100);

  const streams = (data.items || []).map(item => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
    publishedAt: item.snippet.publishedAt,
    eventType
  }));

  cacheSet(cacheKey, streams, TTL[eventType] || TTL.completed);
  return streams;
}

export function fetchLiveStreams(channelId) {
  return fetchStreams(channelId, 'live');
}

export function fetchUpcomingStreams(channelId) {
  return fetchStreams(channelId, 'upcoming');
}

export function fetchCompletedStreams(channelId) {
  return fetchStreams(channelId, 'completed');
}

// Video details (batched, cheap: 1 unit per 50 IDs)

export async function fetchVideoDetails(videoIds) {
  if (!videoIds.length) return [];

  const results = [];
  // Batch in groups of 50
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);

    // Check cache for each, collect misses
    const misses = [];
    for (const id of batch) {
      const cached = cacheGet(`video:${id}`);
      if (cached) {
        results.push(cached);
      } else {
        misses.push(id);
      }
    }

    if (misses.length === 0) continue;

    const data = await apiCall('videos', {
      part: 'snippet,liveStreamingDetails',
      id: misses.join(',')
    }, 1);

    for (const item of (data.items || [])) {
      const detail = {
        videoId: item.id,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnailUrl: item.snippet.thumbnails?.medium?.url || '',
        concurrentViewers: item.liveStreamingDetails?.concurrentViewers || null,
        scheduledStartTime: item.liveStreamingDetails?.scheduledStartTime || null,
        actualStartTime: item.liveStreamingDetails?.actualStartTime || null,
        actualEndTime: item.liveStreamingDetails?.actualEndTime || null
      };
      cacheSet(`video:${item.id}`, detail, TTL.video);
      results.push(detail);
    }
  }

  return results;
}

// Convenience: fetch all stream types for a channel

export async function fetchAllStreams(channelId) {
  const [live, upcoming, completed] = await Promise.all([
    fetchLiveStreams(channelId).catch(() => []),
    fetchUpcomingStreams(channelId).catch(() => []),
    fetchCompletedStreams(channelId).catch(() => [])
  ]);

  // Enrich with video details
  const allIds = [...live, ...upcoming, ...completed].map(s => s.videoId);
  let details = [];
  try {
    details = await fetchVideoDetails(allIds);
  } catch { /* non-critical */ }

  const detailMap = new Map(details.map(d => [d.videoId, d]));

  const enrich = (streams) => streams.map(s => ({
    ...s,
    ...(detailMap.get(s.videoId) || {})
  }));

  return {
    live: enrich(live),
    upcoming: enrich(upcoming),
    completed: enrich(completed)
  };
}

// Quota helpers

export function getQuotaInfo() {
  const usage = getQuotaUsage();
  return { used: usage.used, limit: QUOTA_LIMIT };
}

export function isQuotaSafe() {
  return getQuotaUsage().used < QUOTA_LIMIT * 0.8;
}

// Validate API key with a cheap call

export async function validateApiKey(key) {
  const url = new URL(`${BASE}/channels`);
  url.searchParams.set('part', 'id');
  url.searchParams.set('forHandle', 'Google');
  url.searchParams.set('key', key);

  const res = await fetch(url.toString());
  if (!res.ok) return false;
  addQuotaUsage(1);
  return true;
}
