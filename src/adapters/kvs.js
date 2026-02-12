export class KVSAdapter {
  constructor(kvNamespace) {
    if (kvNamespace) {
      this.store = kvNamespace;
      this.isMock = false;
    } else {
      this.store = new Map();
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
    // 1. Read-Before-Write Strategy
    const exists = await this.get(key);
    if (exists) { 
      console.log("[KVSAdapter.put] skipping: already exists"); 
      return;
    }
    // 2. Write with Options (like expirationTtl)
    return await this.store.put(key, value, options);
  }

  async delete(key) {
    if (!this.isMock) return await this.store.delete(key);
    this.store.delete(key);
  }
}
