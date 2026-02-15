export const PROXY_VALID_PATH = "/proxy/";
export const OPML_VALID_PATH = "/opml/";

export let VALID_KEYS = null;

export function AUTH_LOAD(env) {
  if (VALID_KEYS instanceof Set) {
    console.log(`[AUTH] Recycled: ${VALID_KEYS.size}`);
    return;
  }

  try {
    const keys = JSON.parse(env.VALID_KEYS);
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error("Invalid keys: must be a non-empty array");
    }
    VALID_KEYS = new Set(keys);
    console.log(`[AUTH] Loaded: ${VALID_KEYS.size}`);
  } catch (e) {
    console.error(`[AUTH] Failed: VALID_KEYS: ${e.message}`);
    throw e;
  }
}
