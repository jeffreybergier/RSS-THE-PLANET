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
