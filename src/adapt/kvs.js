
function isString(input) { 
  return typeof input === 'string' && input.length > 0;
}

function isKVSValue(input) {
  return input instanceof KVSValue;
}

function isKVSMeta(input) {
  return input instanceof KVSMeta;
}

export class KVSValue {
  // Key can be null. In that case a new UDID is generated
  constructor(key, name, value, service, owner) {
    if (isString(name) && isString(value) && isString(service) && isString(owner)) {
      this.key = isString(key) ? key : crypto.randomUUID();
      this.name = name;
      this.value = value;
      this.service = service;
      this.owner = owner;
    } else {
      throw new Error("[KVSValue] invalid arguments");
    }
  }
}

export class KVSMeta {
  constructor(key, name, service, owner) {
    if (isString(key) && isString(name) && isString(service) && isString(owner)) {
      this.key = key;
      this.name = name;
      this.service = service;
      this.owner = owner;
    } else {
      throw new Error("[KVSMeta] invalid arguments");
    }
  }
}

export class KVSAdapter {
  constructor(env, service, owner) {
    if (!env || !env.RSS_THE_PLANET_KVS) {
      throw new Error("KVSAdapter Error: env.RSS_THE_PLANET_KVS is missing");
    }
    if (!isString(service)) {
      throw new Error("KVSAdapter Error: service must be a non-empty string");
    }
    if (!isString(owner)) {
      throw new Error("KVSAdapter Error: owner must be a non-empty string");
    }
    
    this.store = env.RSS_THE_PLANET_KVS;
    this.service = service;
    this.owner = owner;
    
    this.storeIsMap();
  }
  
  storeIsMap() {
    if (this.store instanceof Map) {
      return true;
    } else if (this.store && typeof this.store.put === 'function') {
      return false;
    } else {
      throw new Error("KVSAdapter Error: Invalid Store");
    }
  }

  // Returns KVSValue or null
  async __get(key) {
    if (!isString(key)) throw new Error("[KVS.__get] invalid arguments");
    if (this.storeIsMap()) {
      const entry = this.store.get(key);
      return isKVSValue(entry) ? entry : null;
    } else {
      const { value, metadata } = await this.store.getWithMetadata(key);
      const name = metadata?.["name"];
      const owner = metadata?.["owner"];
      const service = metadata?.["service"];
      if (!isString(value) || !isString(name) || !isString(owner) || !isString(service)) {
        console.error(`[KVS.__get] failed validation: ${key}`);
        return null;
      }
      return new KVSValue(key, name, value, service, owner);
    }
  }
  
  // Returns KVSValue or null
  async get(key) {
    const entry = await this.__get(key);
    if (!isKVSValue(entry)) return null;
    if (entry.owner === this.owner && entry.service === this.service) return entry;
    console.error(`[KVS.get] failed authentication`);
    return null;
  }
  
    // Returns KVSValue or null
  async __put(value) {
    if (!isKVSValue(value)) throw new Error("[KVS.__put] invalid arguments");
    if (this.storeIsMap()) {
      this.store.set(value.key, value);
      return value;
    } else {
      const metadata = { name: value.name, owner: value.owner, service: value.service };
      await this.store.put(value.key, value.value, { metadata: metadata });
      return value;
    }
  }
  
  // Returns KVSValue or null
  async put(value) {
    if (!isKVSValue(value)) throw new Error("[KVS.put] invalid arguments");
    if (value.owner === this.owner && value.service === this.service) return await this.__put(value);
    console.error(`[KVS.put] failed authentication`);
    return null;
  }

  // return void
  async __delete(key) {
    if (!isString(key)) throw new Error("[KVS.delete] invalid arguments");
    if (this.storeIsMap()) {
      this.store.delete(key);
      return;
    } else {
      await this.store.delete(key);
      return;
    }
  }
  
  // return void
  async delete(key) {
    if (!isString(key)) throw new Error("[KVS.delete] invalid arguments");
    const entry = await this.get(key);
    if (!isKVSValue(entry)) {
      console.error(`[KVS.delete] failed authentication`);
      return;
    }
    await this.__delete(entry.key);
    return;
  }
  
  // returns [KVSMeta]
  async __list() {
    if (this.storeIsMap()) {
      const output = Array.from(this.store).map(([_, value]) => {
        if (!isKVSValue(value)) return null;
        return new KVSMeta(value.key, value.name, value.service, value.owner);
      });
      return output;
    } else {
      const { keys, list_complete } = await this.store.list();
      if (!list_complete) console.error(`[KVS.__list] incomplete`);
      const output = keys.map(input => {
        const key = input.name;
        const name = input.metadata?.["name"];
        const owner = input.metadata?.["owner"];
        const service = input.metadata?.["service"];
        if (!isString(key) || !isString(name) || !isString(owner) || !isString(service)) return null;
        return new KVSMeta(key, name, service, owner);
      });
      return output;
    }
  }
  
  // returns [KVSMeta]
  async list() {
    const allEntries = await this.__list();
    return allEntries.filter(value => {
      if (!isKVSMeta(value)) return false;
      return (this.owner === value.owner && this.service === value.service);
    });
  }
}
