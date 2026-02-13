# RSS THE PLANET

A legacy-compatible RSS proxy and OPML rewriter designed for Cloudflare Workers and Node.js.

## Features

*   **RSS/Atom Proxy**: Rewrites feed content for legacy reader compatibility, stripping tracking pixels and rewriting asset URLs.
*   **Media Proxy**: Proxies and resizes images/audio to ensure they render on older devices.
*   **OPML Service**:
    *   **Rewriter**: Upload OPML files to batch-rewrite all feed URLs through the proxy.
    *   **Cloud Storage**: Securely save your OPML files to Cloudflare KV.
    *   **On-Demand Conversion**: Download original or proxied versions of your stored files.
*   **Cross-Platform**: Fully supported on Cloudflare Workers (Edge) and Node.js (Docker/VPS).
*   **Security**: API Key authentication for all proxy and storage operations.

## Quick Start

1.  **Configure**: Set `VALID_KEYS='["your-api-key"]'` in `.env` (Node) or `wrangler.toml` (Cloudflare).
2.  **Run**:
    *   `npm start`: Start Node.js server (Port 3000).
    *   `npx wrangler dev`: Start Cloudflare dev server (Port 8787).
3.  **Test**:
    *   `npm run test:node`: Run unit/integration tests in Node.js.
    *   `npm test`: Run tests in the Cloudflare Workers environment.

## Endpoints

*   `/proxy/`: Feed and asset proxy service.
*   `/opml/`: OPML management dashboard.
