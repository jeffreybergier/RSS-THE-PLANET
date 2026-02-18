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
  const hashBuffer = await crypto.subtle.digest('MD5', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export class SHA256 {
  constructor(request, env, ctx) {
    if (!(request instanceof Request)) {
      throw new Error("[SHA256.constructor] invalid request");
    }
    this.secret = env?.ENCRYPTION_SECRET;
    if (typeof this.secret !== 'string') {
      throw new Error("[SHA256.constructor] missing ENCRYPTION_SECRET");
    }
  }

  async encrypt(text, owner) {
    if (typeof text !== 'string' || typeof owner !== 'string') {
      throw new Error("[SHA256.encrypt] invalid arguments");
    }
    return await SHA256.__encrypt(text, this.secret + owner);
  }

  async decrypt(text, owner) {
    if (typeof text !== 'string' || typeof owner !== 'string') {
      throw new Error("[SHA256.decrypt] invalid arguments");
    }
    return await SHA256.__decrypt(text, this.secret + owner);
  }

  static async __encrypt(text, secret) {
    if (typeof text !== 'string' || typeof secret !== 'string') {
      throw new Error("[SHA256.encrypt] invalid arguments");
    }
    const enc = new TextEncoder();
    const keyDerivation = await crypto.subtle.digest("SHA-256", enc.encode(secret));
    const key = await crypto.subtle.importKey("raw", keyDerivation, "AES-GCM", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
    const combined = new Uint8Array(12 + encrypted.byteLength);
    combined.set(iv); combined.set(new Uint8Array(encrypted), 12);
    let binary = "";
    for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
    return "v1:" + btoa(binary);
  }

  static async __decrypt(text, secret) {
    if (typeof text !== 'string' || typeof secret !== 'string') {
      throw new Error("[SHA256.decrypt] invalid arguments");
    }
    if (!text.startsWith("v1:")) return text;
    const enc = new TextEncoder();
    const keyDerivation = await crypto.subtle.digest("SHA-256", enc.encode(secret));
    const key = await crypto.subtle.importKey("raw", keyDerivation, "AES-GCM", false, ["decrypt"]);
    try {
      const binary = atob(text.slice(3));
      const combined = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i);
      const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) }, key, combined.slice(12));
      return new TextDecoder().decode(dec);
    } catch (e) {
      console.error(`[SHA256.decrypt] ${e.message}`);
      return null;
    }
  }
}
    