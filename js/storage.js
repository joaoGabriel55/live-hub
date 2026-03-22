const PREFIX = 'lh_';

function read(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    localStorage.removeItem(PREFIX + key);
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      clearCache();
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    }
  }
}

// API Key

export function getApiKey() {
  return read('apiKey');
}

export function setApiKey(key) {
  write('apiKey', key);
}

// Channels

export function getChannels() {
  return read('channels') || [];
}

export function addChannel(channel) {
  const channels = getChannels();
  if (channels.some(c => c.id === channel.id)) return false;
  channels.push(channel);
  write('channels', channels);
  return true;
}

export function removeChannel(channelId) {
  const channels = getChannels().filter(c => c.id !== channelId);
  write('channels', channels);
  // Clear related cache entries
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX + 'cache:') && k.includes(channelId)) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}

// TTL Cache

export function cacheGet(key) {
  const entry = read('cache:' + key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    localStorage.removeItem(PREFIX + 'cache:' + key);
    return null;
  }
  return entry.data;
}

export function cacheSet(key, data, ttlSeconds) {
  write('cache:' + key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000
  });
}

export function clearCache() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX + 'cache:')) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}

// Settings

export function getSettings() {
  return read('settings') || { refreshInterval: 15 };
}

export function setSettings(settings) {
  write('settings', settings);
}

// Quota tracking

export function getQuotaUsage() {
  const usage = read('quota');
  if (!usage || usage.date !== new Date().toISOString().slice(0, 10)) {
    return { date: new Date().toISOString().slice(0, 10), used: 0 };
  }
  return usage;
}

export function addQuotaUsage(units) {
  const usage = getQuotaUsage();
  usage.used += units;
  write('quota', usage);
  return usage.used;
}
