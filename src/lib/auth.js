
export class Auth {

  static VALID_KEYS = null;

  static load(env) {
    if (Auth.VALID_KEYS instanceof Set) {
      console.log(`[Auth.load] Recycled: ${Auth.VALID_KEYS.size}`);
      return;
    }
    try {
      const keys = JSON.parse(env.VALID_KEYS);
      if (!Array.isArray(keys) || keys.length === 0) {
        throw new Error("Invalid keys: must be a non-empty array");
      }
      Auth.VALID_KEYS = new Set(keys);
      console.log(`[Auth.load] Loaded: ${Auth.VALID_KEYS.size}`);
    } catch (e) {
      console.error(`[Auth.load] Failed: VALID_KEYS: ${e.message}`);
      throw e;
    }
  }

  static async validate(request) {
    try {
      if (!(Auth.VALID_KEYS instanceof Set)) {
        throw new Error("[Auth.load] Invalid keys missing: call load first!");
      }
      const url = new URL(request.url);
      let key = url.searchParams.get('key');
      if (!key && request.method === 'POST') {
        const formData = await request.clone().formData();
        const bodyKey = formData.get('key');
        if (typeof bodyKey === 'string') {
          key = bodyKey;
        }
      }
      if (key && Auth.VALID_KEYS.has(key)) {
        return key;
      }
      return null;
    } catch (e) {
      console.error(`[Auth.validate] error: ${e.message}`);
      return null;
    }
  }
}
