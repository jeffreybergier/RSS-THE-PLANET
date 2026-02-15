export const PROXY_VALID_PATH = "/proxy/";
export const OPML_VALID_PATH = "/opml/";

export let VALID_KEYS = null;

export function AUTH_LOAD(env) {
  if (VALID_KEYS) { 
    console.log(`[routes.auth] Recycled: ${VALID_KEYS.size}`);
    return; 
  }
  try {
    VALID_KEYS = new Set(JSON.parse(env.VALID_KEYS));
    console.log(`[routes.auth] Loaded: ${VALID_KEYS.size}`);
  } catch (e) {
    console.error(`[routes.auth] Failed ${e.message}`);
    VALID_KEYS = new Set();
  }
}
