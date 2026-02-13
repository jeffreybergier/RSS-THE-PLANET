export class KVSAdapter {
  constructor(kvNamespace) {
    if (kvNamespace && typeof kvNamespace.put === 'function') {
      this.store = kvNamespace;
      this.isMock = false;
    } else {
      // If it's null, undefined, or a Map (which doesn't have .put), treat as mock
      this.store = (kvNamespace instanceof Map) ? kvNamespace : new Map();
      this.isMock = true;
    }
  }

  async get(key) {
    if (!this.isMock) return await this.store.get(key);
    const val = this.store.get(key);
    return val === undefined ? null : val;
  }

  async put(key, value, options = {}) {
    if (this.isMock) {
      this.store.set(key, value);
      return;
    }
    // 1. Read-Before-Write Strategy (unless forced)
    if (!options.allowOverwrite) {
      const exists = await this.get(key);
      if (exists) { 
        console.log("[KVSAdapter.put] skipping: already exists"); 
        return;
      }
    }
    // 2. Write with Options (like expirationTtl)
    return await this.store.put(key, value, options);
  }

  async list(options = {}) {
    if (this.isMock) {
      const prefix = options.prefix || "";
      const keys = [];
      for (const key of this.store.keys()) {
        if (key.startsWith(prefix)) {
          keys.push({ name: key });
        }
      }
      return { keys };
    }
    return await this.store.list(options);
  }

  async delete(key) {
    if (!this.isMock) return await this.store.delete(key);
    this.store.delete(key);
  }
}
