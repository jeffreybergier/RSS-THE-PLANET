# RSS-THE-PLANET (formerly insecure-xml-proxy)

A high-performance, privacy-focused RSS proxy and generator designed to run on **Cloudflare Workers** or **Node.js**. This application transforms siloed social media content and restricted feeds into clean, standards-compliant RSS/Atom feeds.

## Features

- **YouTube Subscriptions & Playlists:** Converts your YouTube subscriptions and public/private playlists into a combined RSS feed.
  - **Shorts Filtering:** Automatically filters out videos shorter than 3 minutes to keep your feed high-signal.
  - **Smart Rotation:** Sequentially rotates through your subscriptions (up to 100 channels) to bypass API batch limits while ensuring total coverage over time.
  - **Live Stream Support:** Gracefully handles live stream durations (P0D).
- **Mastodon Timeline:** Generates RSS feeds for Mastodon home timelines, notifications, and public profiles.
- **Universal XML Proxy:** Proxies and cleans existing XML/RSS feeds to bypass CORS restrictions or fix malformed XML.
- **OPML Integration:** Export your configured YouTube playlists as an OPML file for easy import into any RSS reader.

## Security & Privacy

- **Encrypted Storage:** All sensitive credentials (tokens, API keys) are encrypted in the Cloudflare KV store using your private `ENCRYPTION_SECRET` and SHA256-based authenticated encryption.
- **Isolate-Only Secrets:** Critical configuration like your `YOUTUBE_APP_KEY` and `VALID_KEYS` are stored as Cloudflare Secrets, never exposed to the client.
- **⚠️ Important Disclaimer:** The primary purpose of this application is to expose private content (like your YouTube subscriptions or Mastodon timeline) as public RSS feeds so they can be consumed by RSS readers. This process is **inherently insecure** because anyone with the final RSS URL can view that content.
- **Best Practices:**
  - Always ensure the tokens you provide (e.g., Mastodon Access Tokens) are **read-only**.
  - Use a long, unique `key` in your `VALID_KEYS` configuration.
  - Revoke tokens immediately if you suspect your RSS URLs have been compromised.

## Why Self-Hosting is Required

I cannot provide a public URL for my own Cloudflare Worker instance. Because this app performs heavy lifting (fetching multiple API pages, batching video metadata, and re-writing HTML/XML), a single public instance would quickly exceed Cloudflare’s free-tier CPU limits and YouTube's API quota.

**The solution is to host your own instance.** It is free, private, and ensures you have your own dedicated API quotas.

## Setup Walkthrough

### 1. Clone and Install
```bash
git clone https://github.com/your-repo/RSS-THE-PLANET.git
cd RSS-THE-PLANET
npm install
```

### 2. Configure Cloudflare Secrets
Configure these secrets in your Cloudflare Dashboard (Settings > Variables) or via `wrangler secret put`:

| Secret | Description | Required |
| :--- | :--- | :--- |
| `ENCRYPTION_SECRET` | A long, random string used to encrypt/decrypt sensitive data (like API tokens) stored in the KV. | **Yes** |
| `VALID_KEYS` | A JSON array of strings (e.g., `["key1", "key2"]`) that are authorized to use your proxy instance. | **Yes** |
| `YOUTUBE_APP_KEY` | A JSON string from your Google Cloud Console containing your OAuth 2.0 Client ID and Secret. | Optional |

> **Note:** For local development, use a `.dev.vars` file in the root directory.

### 3. Sourcing API Keys

#### Mastodon
Mastodon credentials are NOT stored in environment variables. You add them via the web UI once the worker is deployed:
1. Navigate to `https://your-worker.workers.dev/masto?key=YOUR_VALID_KEY`.
2. Enter your Mastodon server (e.g., `https://mastodon.social`) and your **Access Token** (read-only).
3. The app will encrypt and save this to your Cloudflare KV store.

#### YouTube
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project and enable the **YouTube Data API v3**.
3. Create **OAuth 2.0 Client IDs** (Type: Web Application).
4. Add `https://your-worker.workers.dev/callback/youtube` to your **Authorized redirect URIs**.
5. Download the JSON and set it as the `YOUTUBE_APP_KEY` secret.
6. Navigate to `https://your-worker.workers.dev/youtube?key=YOUR_VALID_KEY` and click **Connect Account**.

### 4. Deploy to Cloudflare
```bash
# Login to Cloudflare
npx wrangler login

# Deploy the worker
npx wrangler deploy
```

## Local Development
You can run the app locally using Node.js or Wrangler:
- **Wrangler (Cloudflare Sim):** `npm run start:wrangler`
- **Node.js:** `npm start`

## Technical Architecture
- **Adapter Pattern:** Uses a custom adaptation layer (`src/adapt/`) to abstract KVS, Crypto, and HTML Rewriting, allowing the same logic to run on both Node.js and Cloudflare Workers.
- **Efficiency:** Utilizes API batching to fetch metadata for 50 videos in a single request.
- **Security:** All sensitive credentials (tokens, API keys) are encrypted in the KV store using your `ENCRYPTION_SECRET`.
- **Kaizen:** Developed with a focus on small, intentional, and robust improvements.
