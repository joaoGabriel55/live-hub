# CLAUDE.md

## Project Overview

LiveStream Hub is a vanilla JavaScript SPA that monitors YouTube live streams. No framework, no build tools -- just ES modules served directly from `index.html`.

## Key Conventions

- All JS uses ES module imports/exports (`js/` directory)
- DOM manipulation is centralized in `ui.js` -- app logic should not touch the DOM directly
- YouTube API calls go through `youtube.js` which handles caching and quota tracking
- State is persisted via `storage.js` using localStorage with `lh_` prefix

## Architecture Rules

- **Upcoming and Recent Streams are only fetched/displayed when a channel is selected** in the sidebar. This is intentional to conserve YouTube API quota. Do not change this to load on init.
- Live streams are fetched for all saved channels on init and auto-refresh
- Auto-refresh uses round-robin (one channel per interval) for live streams only

## File Guide

- `js/app.js` -- Entry point, state management, event wiring. Owns `selectedChannelId` and `allStreams` state.
- `js/ui.js` -- Pure rendering functions. Receives data, returns/mutates DOM. No API calls.
- `js/youtube.js` -- YouTube Data API v3 wrapper. All fetches go through `apiCall()` which tracks quota.
- `js/storage.js` -- localStorage CRUD with TTL cache support.
- `style.css` -- Single stylesheet, dark theme, CSS custom properties in `:root`.
- `index.html` -- Semantic HTML structure, no inline scripts.

## Testing

Tests use Node's built-in test runner (`node --test`) with no external dependencies. Test helpers in `tests/helpers.js` provide browser globals mocks (e.g. localStorage).

- `npm test` -- Run all tests
- `npm run test:unit` -- Unit tests only (storage, youtube, ui)
- `npm run test:integration` -- Integration tests only (app)

Test files:
- `tests/storage.test.js` -- storage.js unit tests
- `tests/youtube.test.js` -- youtube.js unit tests
- `tests/ui.test.js` -- ui.js unit tests
- `tests/app.integration.test.js` -- End-to-end app integration tests
- `tests/helpers.js` -- Shared mocks (localStorage, DOM stubs)

## Common Tasks

- **Adding a new stream section**: Add HTML in `index.html`, rendering in `ui.js`, fetching in `youtube.js`, orchestration in `app.js`
- **Modifying cache TTLs**: Edit the `TTL` object in `youtube.js`
- **Changing quota limits**: `QUOTA_LIMIT` constant in `youtube.js`
