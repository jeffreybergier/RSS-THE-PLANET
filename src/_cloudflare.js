import * as Router  from './router.js';

export default {
  async fetch(request, env, ctx) {
    if (!env.URL_STORE) {
      // TODO: Remove this ephemeral fallback once a real KV Namespace is configured in wrangler.toml
      // Ephemeral fallback for when KV is not configured in wrangler.toml
      // Note: This Map is recreated on every request in some edge cases, 
      // but usually persists per-isolate.
      if (!globalThis._EPHEMERAL_STORE) {
        globalThis._EPHEMERAL_STORE = new Map();
      }
      env.URL_STORE = globalThis._EPHEMERAL_STORE;
    }
    return Router.route(request, env, ctx);
  }
}
