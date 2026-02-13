import { describe, it, expect } from 'vitest';
import { md5 } from '../src/adapt/crypto.js';

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
