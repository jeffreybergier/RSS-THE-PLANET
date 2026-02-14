export class KVSAdapter {
  constructor(env) {
    if (!env || !env.RSS_THE_PLANET_KVS) {
      throw new Error("KVSAdapter Error: env.RSS_THE_PLANET_KVS is missing");
    }
    const kvNamespace = env.RSS_THE_PLANET_KVS;
    
    if (typeof kvNamespace.put === 'function') {
      this.store = kvNamespace;
      this.isMock = false;
    } else if (kvNamespace instanceof Map) {
      this.store = kvNamespace;
      this.isMock = true;
    } else {
      throw new Error("KVSAdapter Error: env.RSS_THE_PLANET_KVS is not a valid KV Namespace or Map");
    }
  }

  async get(key) {
    if (!this.isMock) return await this.store.get(key);
    const entry = this.store.get(key);
    // If we stored an object with value/metadata, return the value
    // (This mimics standard KV.get(key))
    if (entry && typeof entry === 'object' && 'value' in entry) {
      return entry.value;
    }
    return entry === undefined ? null : entry;
  }

  async getWithMetadata(key) {
    if (!this.isMock) return await this.store.getWithMetadata(key);
    const entry = this.store.get(key);
    if (entry && typeof entry === 'object' && 'value' in entry) {
      return { value: entry.value, metadata: entry.metadata };
    }
    return { value: entry === undefined ? null : entry, metadata: null };
  }

  async put(key, value, options = {}) {
    if (this.isMock) {
      // Store value and metadata together
      this.store.set(key, { value, metadata: options.metadata });
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
      for (const [key, entry] of this.store.entries()) {
        if (key.startsWith(prefix)) {
          keys.push({ 
            name: key, 
            metadata: (entry && typeof entry === 'object') ? entry.metadata : undefined 
          });
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
