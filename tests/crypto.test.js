import { describe, it, expect } from 'vitest';
import { md5, SHA256 } from '../src/adapt/crypto.js';

describe('md5', () => {
  it('should return correct hash for a simple string', async () => {
    const input = 'hello';
    const expected = '5d41402abc4b2a76b9719d911017c592';
    const result = await md5(input);
    expect(result).toBe(expected);
  });

  it('should return correct hash for an empty string', async () => {
    const input = '';
    const expected = 'd41d8cd98f00b204e9800998ecf8427e';
    const result = await md5(input);
    expect(result).toBe(expected);
  });

  it('should return correct hash for a long string', async () => {
    const input = 'The quick brown fox jumps over the lazy dog';
    const expected = '9e107d9d372bb6826bd81d3542a419d6';
    const result = await md5(input);
    expect(result).toBe(expected);
  });
});

describe('encryption', () => {
  it('should encrypt and decrypt correctly', async () => {
    const text = "secret message";
    const secret = "my-password";
    const owner = "user-123";
    const encrypted = await SHA256.__encrypt(text, secret + owner);
    expect(encrypted.startsWith("v1:")).toBe(true);
    const decrypted = await SHA256.__decrypt(encrypted, secret + owner);
    expect(decrypted).toBe(text);
  });

  it('should return null for wrong secret or owner', async () => {
    const text = "secret message";
    const secret = "correct-secret";
    const owner = "correct-owner";
    const encrypted = await SHA256.__encrypt(text, secret + owner);
    
    expect(await SHA256.__decrypt(encrypted, "wrong-secret" + owner)).toBeNull();
    expect(await SHA256.__decrypt(encrypted, secret + "wrong-owner")).toBeNull();
  });

  it('should return original text if not encrypted', async () => {
    const text = "plain text";
    const result = await SHA256.__decrypt(text, "any-secret" + "any-owner");
    expect(result).toBe(text);
  });
});

describe('SHA256 Class', () => {
  const env = { ENCRYPTION_SECRET: "top-secret" };
  const owner = "owner-456";
  const request = new Request("http://example.com");

  it('should throw if secret is missing', () => {
    expect(() => new SHA256(request, {}, {})).toThrow("[SHA256.constructor] missing ENCRYPTION_SECRET");
  });

  it('should throw if request is invalid', () => {
    expect(() => new SHA256({}, env, {})).toThrow("[SHA256.constructor] invalid request");
  });

  it('should encrypt and decrypt using the class methods', async () => {
    const text = "hello world";
    const crypto = new SHA256(request, env, {});
    const encrypted = await crypto.encrypt(text, owner);
    expect(encrypted.startsWith("v1:")).toBe(true);
    const decrypted = await crypto.decrypt(encrypted, owner);
    expect(decrypted).toBe(text);
  });
});
