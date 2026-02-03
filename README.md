# Retro Mac Proxy

A sophisticated **Cloudflare Workers** application designed to act as a bridge between the modern web and legacy systems (PowerPC Macs, early iPhones, and other vintage hardware). This proxy "translates" modern web standards into formats that lean, older browsers and RSS readers can handle without crashing.

## 🚀 Key Features

### 1. Multi-Mode Proxy Engine

The engine automatically categorizes requests to apply the most efficient transformation:

* **Feed Mode:** Specialized XML rewriting for RSS and Atom feeds.
* **HTML Mode:** Strips modern complexities from web pages.
* **Image Mode:** Dynamic resizing and re-encoding for low-RAM devices.
* **Asset Mode:** Secure pass-through for binary files (MP3, PDF, etc.).
* **Auto-Detection:** Performs a `HEAD` request to automatically determine the best proxy mode for any given URL.

### 2. Intelligent RSS/Atom Transformation

Optimized for vintage RSS readers (like NetNewsWire Lite or early iTunes):

* **Recursive Proxying:** Automatically rewrites all internal links, enclosures, and thumbnails to route through the proxy.
* **Memory Management (Date Pruning):** Automatically removes articles older than **12 months** to prevent large feeds from crashing legacy apps.
* **Podcast Support:** Specifically handles `itunes:image` and `enclosure` tags for legacy iPod/iPhone syncing.
* **Sanitization:** Strips `xml-stylesheet` declarations that often cause rendering errors on older XML parsers.

### 3. Modern-to-Legacy HTML Rewriting

Uses Cloudflare's `HTMLRewriter` to perform real-time "surgery" on web pages:

* **JavaScript Stripping:** Removes all `<script>` tags and `on*` event attributes to prevent execution errors.
* **Asset Routing:** Updates `<a>`, `<img>`, `<video>`, and `<audio>` tags to ensure they load via the proxy's compatible TLS stack.
* **CSS Proxying:** Routes stylesheets through the proxy to bypass modern TLS/SSL handshake requirements.

### 4. Advanced Image Optimization

Specifically designed to save VRAM and System RAM:

* **Resizing:** Downscales images to a maximum of **1024x1024** via `wsrv.nl`.
* **Format Conversion:** Converts heavy modern formats into standard **JPG**.
* **Srcset Flattening:** Parses complex modern `srcset` attributes, selects the best version **under 1000px**, and flattens it into a standard `src` tag.

### 5. Compatibility "Hacks"

Built-in logic to handle specific modern web hurdles:

* **Tracker Stripping:** Automatically "unwraps" Podtrac and Blubrry URLs to provide direct media links, reducing redirect overhead.
* **Safe URL Encoding:** Uses a Base64-in-Path encoding scheme to ensure target URLs don't break legacy parsers sensitive to complex query strings.
* **UA Spoofing:** Identifies as a legacy podcast client to ensure compatibility with modern hosting providers that block generic bots.

## 🛠 Technical Environment

* **Platform:** Optimized for Cloudflare Workers but includes a Node.js polyfill for local development.
* **Security:** Integrated API Key authorization to prevent unauthorized proxy usage.
* **Performance:** Uses streaming HTML rewriting for minimal latency.

---

**Would you like me to add a "Getting Started" or "Installation" section to this based on how you deploy your worker?**