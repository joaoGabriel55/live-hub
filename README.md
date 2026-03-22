# LiveZenTube

A lightweight, client-side web app for monitoring YouTube live streams across multiple channels. No backend required -- everything runs in the browser using the YouTube Data API v3.

## Features

- **Channel management** -- Add channels by @handle or name, saved to localStorage
- **Live Now** -- Shows live streams across all saved channels
- **Upcoming & Recent Streams** -- Displayed per-channel when you select one from the sidebar (saves API quota)
- **Embedded player** -- Watch streams without leaving the app
- **Auto-refresh** -- Configurable interval (5-120 min), round-robin per channel
- **Quota tracking** -- Displays daily YouTube API usage with warnings at 50%/80%
- **TTL caching** -- Reduces redundant API calls (live: 2min, upcoming: 5min, completed: 30min)
- **Dark theme** -- Responsive layout with mobile support

## Getting Started

1. Open `index.html` in a browser
2. Enter your [YouTube Data API v3 key](https://console.cloud.google.com/apis/credentials) when prompted
3. Add channels via the sidebar input
4. Click a channel to view its upcoming and recent streams

## Architecture

```
index.html          -- Single-page HTML shell
style.css           -- Dark-themed responsive styles
js/
  app.js            -- Application state, event wiring, orchestration
  ui.js             -- DOM rendering (channels, stream cards, modals, toasts)
  youtube.js        -- YouTube Data API v3 wrapper with caching
  storage.js        -- localStorage abstraction (channels, cache, settings, quota)
```

- **No build step** -- vanilla ES modules loaded directly by the browser
- **No backend** -- all data persisted in localStorage
- **Quota-conscious** -- live streams fetched for all channels; upcoming/completed only fetched when a channel is selected

## Testing

Tests use Node's built-in test runner with zero external dependencies.

```bash
npm test              # Run all tests
npm run test:unit     # Unit tests (storage, youtube, ui)
npm run test:integration  # Integration tests (app)
```

## API Quota Usage

YouTube Data API v3 has a 10,000 unit daily limit. Approximate costs per operation:

| Operation | Cost |
|-----------|------|
| Resolve channel by handle | 1 unit |
| Resolve channel by search | 100 units |
| Search streams (per type per channel) | 100 units |
| Video details (per 50 videos) | 1 unit |

The app pauses auto-refresh at 80% quota usage.
