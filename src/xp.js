
// XP.js
// This is a crossplatform file to ensure that this project can be
// used with Cloudflare and plain old Node.js

export let HTMLRewriter;
if (globalThis.HTMLRewriter) {
  console.log("[proxy] Using HTMLRewriter from Cloudflare");
  HTMLRewriter = globalThis.HTMLRewriter;
} else {
  console.log("[proxy] Using HTMLRewriter from @miniflare");
  const packageName = "@miniflare/html-rewriter"; 
  const mod = await import(packageName);
  HTMLRewriter = mod.HTMLRewriter;
}

class KVStore {
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
      return; // Exit early so we don't hit the real KV logic
    }
    // 1. Read-Before-Write Strategy
    const exists = await this.get(key);
    if (exists) { 
      console.log("[XP.KVS.put] skipping: already exists"); 
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

// THE SINGLETON
// This will be initialized once in _cloudflare.js
export let KVS = null;

/// TODO: Add to readme
/// Using this will require you to set up a KVS namespace in Cloudflare
/// And then update the Wrangler.toml
/// npx wrangler kv namespace create URL_STORE
export function initKV(kvNamespace) {
  if (KVS !== null) return; // Prevent double initialization
  console.log(`[XP.KVS] initialized(${kvNamespace})`);
  KVS = new KVStore(kvNamespace);
}

export async function md5(message) {
  const msgUint8 = new TextEncoder().encode(message);

  // 1. Try Node's native crypto module first (Legacy/VPS support)
  try {
    const crypto = await import('node:crypto');
    if (crypto.createHash) {
      return crypto.createHash('md5').update(message).digest('hex');
    }
  } catch (e) {
    // Not in Node, or crypto module not accessible
  }

  // 2. Fallback to Web Crypto (Cloudflare / Modern Browsers)
  // Use 'MD5' or 'md5' depending on environment strictness
  const hashBuffer = await crypto.subtle.digest('MD5', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}