// Minimal browser globals mock for Node.js testing

export function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.get(key) ?? null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
    key(index) { return [...store.keys()][index] ?? null; },
    get length() { return store.size; },
    _store: store
  };
}

export function installLocalStorage() {
  const mock = createMockLocalStorage();
  globalThis.localStorage = mock;
  return mock;
}

// Minimal DOM mock

class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.childNodes = [];
    this.attributes = new Map();
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.style = {};
    this.classList = {
      _classes: new Set(),
      add: (...cls) => cls.forEach(c => this.classList._classes.add(c)),
      remove: (...cls) => cls.forEach(c => this.classList._classes.delete(c)),
      toggle: (cls, force) => {
        if (force === undefined) {
          this.classList._classes.has(cls)
            ? this.classList._classes.delete(cls)
            : this.classList._classes.add(cls);
        } else if (force) {
          this.classList._classes.add(cls);
        } else {
          this.classList._classes.delete(cls);
        }
      },
      contains: (cls) => this.classList._classes.has(cls),
    };
    this._listeners = {};
    this.src = '';
    this.href = '';
    this.loading = '';
    this.alt = '';
    this.title = '';
    this.disabled = false;
    this.value = '';
    this.onclick = null;
    this.onkeydown = null;
  }

  setAttribute(key, value) { this.attributes.set(key, value); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  addEventListener(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }
  appendChild(child) {
    if (typeof child === 'object' && child) {
      this.children.push(child);
      this.childNodes.push(child);
    }
    return child;
  }
  remove() {}
  scrollIntoView() {}
  focus() {}
  querySelectorAll(selector) { return []; }
  querySelector(selector) { return null; }
}

class MockTextNode {
  constructor(text) { this.textContent = text; this.nodeType = 3; }
}

export function installDOM() {
  const elements = new Map();

  function registerElement(id, tag = 'div') {
    const el = new MockElement(tag);
    el.id = id;
    elements.set(id, el);
    return el;
  }

  // Register all elements used by the app
  const ids = [
    'channel-list', 'channel-empty', 'channel-input', 'add-channel-btn',
    'refresh-btn', 'settings-btn', 'close-player', 'settings-clear-cache',
    'live-streams', 'upcoming-streams', 'completed-streams',
    'upcoming-section', 'completed-section', 'live-section',
    'player-area', 'player', 'open-youtube', 'player-controls',
    'apikey-modal', 'apikey-input', 'apikey-submit', 'apikey-error',
    'settings-modal', 'settings-apikey', 'settings-interval',
    'settings-save', 'settings-close',
    'quota-display', 'toast-container',
    'content-empty', 'streams-container',
  ];

  for (const id of ids) {
    registerElement(id);
  }

  globalThis.document = {
    createElement(tag) { return new MockElement(tag); },
    createTextNode(text) { return new MockTextNode(text); },
    getElementById(id) { return elements.get(id) || null; },
    addEventListener(event, handler) {},
    querySelectorAll() { return []; },
  };

  return { elements, registerElement, MockElement };
}

// Mock fetch

export function installFetch(handler) {
  globalThis.fetch = async (url, options) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    return handler(urlStr, options);
  };
  return globalThis.fetch;
}

export function mockResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => data,
  };
}

// Install URL if not available (should be in Node)
if (!globalThis.URL) {
  globalThis.URL = URL;
}
