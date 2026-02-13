# RSS THE PLANET

## 🗺️ Project Roadmap (Prioritized Features)

This roadmap outlines the planned feature extensions, focusing on generating RSS feeds from modern applications to enhance compatibility with legacy systems.

### Priority 1: Mastodon Personal Account RSS Feed

The primary goal is to enable the generation of an RSS feed for a user's personal Mastodon account, allowing older RSS readers to consume Mastodon timelines.

*   **1.1 Mastodon API Integration:**
    *   Research and implement secure authentication methods for the Mastodon API (e.g., OAuth 2.0).
    *   Develop a module to fetch a user's timeline (posts, boosts, replies) from their Mastodon instance.
*   **1.2 RSS Feed Generation for Mastodon:**
    *   Transform the fetched Mastodon timeline data into a standard RSS 2.0 or Atom feed format.
    *   Ensure proper handling of content, media attachments, and author information within the feed.
    *   Implement URL rewriting to ensure any links within Mastodon posts are proxied if necessary for legacy browser compatibility.
*   **1.3 Caching Strategy for Mastodon Feeds:**
    *   Implement a caching mechanism to prevent excessive API calls to Mastodon instances and improve feed delivery performance.

### Priority 2: YouTube Personal Content RSS Feeds

The secondary goal is to create RSS feeds for personal YouTube content, specifically focusing on user-specific elements like playlists.

*   **2.1 YouTube Data API Integration (Playlists):**
    *   Research and implement authentication for the YouTube Data API (e.g., API keys, OAuth for private playlists).
    *   Develop functionality to fetch video lists from user-specified YouTube playlists.
*   **2.2 RSS Feed Generation for YouTube Playlists:**
    *   Convert YouTube playlist data (video titles, descriptions, links, thumbnails) into a standard RSS 2.0 or Atom feed.
    *   Ensure video links are appropriately formatted or proxied for compatibility with legacy media players or browsers.

## 🛠️ Refactoring To-Do List (Completed)

- [x] Create directory structure for serve, lib, and adapt.
- [x] Refactor KVS into KVSAdapter in `src/adapt/kvs.js` and remove singleton pattern.
- [x] Create base Service class in `src/serve/service.js`.
- [x] Refactor ProxyHandler into ProxyService in `src/serve/proxy.js` inheriting from Service.
- [x] Update `router.js` and entry points to use the new structure and KVSAdapter initialization.