import { describe, it, expect, beforeEach } from 'vitest';
import { KVSAdapter, KVSValue, KVSMeta } from '../src/adapt/kvs.js';
import { SHA256 } from '../src/adapt/crypto.js';

describe('KVSAdapter', () => {
  let mockRequest;
  let mockEnv;
  let service;
  let owner;
  let otherOwner;
  let sha256;

  beforeEach(() => {
    mockRequest = new Request("http://example.com");
    mockEnv = {
      RSS_THE_PLANET_KVS: new Map(),
      ENCRYPTION_SECRET: 'test-secret'
    };
    mockRequest.env = mockEnv;
    service = 'test-service';
    owner = 'test-owner';
    otherOwner = 'another-owner';
    sha256 = new SHA256(mockRequest);
  });

  describe('Constructor', () => {
    it('should throw an error if env.RSS_THE_PLANET_KVS is missing', () => {
      expect(() => new KVSAdapter({}, service, owner)).toThrow('KVSAdapter Error: env.RSS_THE_PLANET_KVS is missing');
    });

    it('should throw an error if service is not a non-empty string', () => {
      expect(() => new KVSAdapter(mockEnv, '', owner)).toThrow('KVSAdapter Error: service must be a non-empty string');
    });

    it('should throw an error if owner is not a non-empty string', () => {
      expect(() => new KVSAdapter(mockEnv, service, '')).toThrow('KVSAdapter Error: owner must be a non-empty string');
    });

    it('should correctly assign the sha256 instance if provided', () => {
      const adapter = new KVSAdapter(mockEnv, service, owner, sha256);
      expect(adapter.sha256).toBeInstanceOf(SHA256);
    });

    it('should not assign sha256 if the instance is invalid or missing', () => {
      const adapterWithInvalid = new KVSAdapter(mockEnv, service, owner, {});
      expect(adapterWithInvalid.sha256).toBeUndefined();
    });
  });

  describe('put and get', () => {
    it('should put and get a value', async () => {
      const adapter = new KVSAdapter(mockEnv, service, owner);
      const value = new KVSValue(null, 'test-name', 'test-value', service, owner);
      
      const putResult = await adapter.put(value);
      expect(putResult).toBeInstanceOf(KVSValue);
      expect(putResult.key).toBeDefined();

      const getResult = await adapter.get(putResult.key);
      expect(getResult).toEqual(putResult);
    });

    it('should fail to put a value with a mismatched owner', async () => {
      const adapter = new KVSAdapter(mockEnv, service, owner);
      const value = new KVSValue(null, 'test-name', 'test-value', service, otherOwner);
      const result = await adapter.put(value);
      expect(result).toBeNull();
    });

    it('should fail to get a value with a mismatched owner', async () => {
      const adapterForPutter = new KVSAdapter(mockEnv, service, otherOwner);
      const value = new KVSValue(null, 'test-name', 'test-value', service, otherOwner);
      const putResult = await adapterForPutter.put(value);

      const adapterForGetter = new KVSAdapter(mockEnv, service, owner);
      const getResult = await adapterForGetter.get(putResult.key);
      expect(getResult).toBeNull();
    });

    it('should correctly encrypt and decrypt a value', async () => {
      const adapter = new KVSAdapter(mockEnv, service, owner, sha256);
      const originalValue = 'this-is-a-secret';
      const value = new KVSValue(null, 'test-name', originalValue, service, owner);

      const putResult = await adapter.put(value);
      
      // Check that the value in the store IS encrypted
      const rawStoredValue = mockEnv.RSS_THE_PLANET_KVS.get(putResult.key)?.value;
      expect(rawStoredValue).not.toBe(originalValue);
      expect(rawStoredValue.startsWith('v1:')).toBe(true);
      
      const getResult = await adapter.get(putResult.key);
      expect(getResult.value).toBe(originalValue);
    });
  });

  describe('delete', () => {
    it('should delete a value', async () => {
      const adapter = new KVSAdapter(mockEnv, service, owner);
      const value = new KVSValue(null, 'test-name', 'test-value', service, owner);
      const putResult = await adapter.put(value);
      
      await adapter.delete(putResult.key);
      const getResult = await adapter.get(putResult.key);
      expect(getResult).toBeNull();
    });

    it('should not delete a value with a mismatched owner', async () => {
      const adapterForPutter = new KVSAdapter(mockEnv, service, otherOwner);
      const value = new KVSValue(null, 'test-name', 'test-value', service, otherOwner);
      const putResult = await adapterForPutter.put(value);
      
      const adapterForDeleter = new KVSAdapter(mockEnv, service, owner);
      await adapterForDeleter.delete(putResult.key);

      const getResult = await adapterForPutter.get(putResult.key);
      expect(getResult).not.toBeNull();
    });
  });

  describe('list', () => {
    it('should list values for the correct owner and service', async () => {
      const adapter = new KVSAdapter(mockEnv, service, owner);
      const otherAdapter = new KVSAdapter(mockEnv, service, otherOwner);
      const otherServiceAdapter = new KVSAdapter(mockEnv, 'other-service', owner);

      await adapter.put(new KVSValue(null, 'name1', 'value1', service, owner));
      await adapter.put(new KVSValue(null, 'name2', 'value2', service, owner));
      await otherAdapter.put(new KVSValue(null, 'name3', 'value3', service, otherOwner));
      await otherServiceAdapter.put(new KVSValue(null, 'name4', 'value4', 'other-service', owner));

      const listResult = await adapter.list();
      expect(listResult).toHaveLength(2);
      expect(listResult[0]).toBeInstanceOf(KVSMeta);
      expect(listResult.map(item => item.name)).toContain('name1');
      expect(listResult.map(item => item.name)).toContain('name2');
    });
  });
});
