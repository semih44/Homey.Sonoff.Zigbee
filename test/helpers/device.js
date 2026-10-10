'use strict';

// homey-zigbeedriver: isFirstInit() is true until this store value is false
const FIRST_INIT_STORE_KEY = 'zb_first_init';

/**
 * Creates a driver instance without the Homey runtime. The SDK methods it calls come from the
 * Homey stand-in (test/helpers/homey-module.js) and record their effects for assertions.
 */
function createDevice(DeviceClass, {
  zclNode, data = {}, settings = {}, capabilities = {}, store = {}, firstInit = false,
} = {}) {
  const device = Object.create(DeviceClass.prototype);
  const recorded = { settings: [], capabilityValues: [], errors: [] };

  device.__fake = {
    data: { ...data },
    settings: { ...settings },
    capabilities: { ...capabilities },
    store: { ...store, ...(firstInit ? {} : { [FIRST_INIT_STORE_KEY]: false }) },
    recorded,
  };
  device.zclNode = zclNode;
  device.log = () => {};
  device.error = (...args) => recorded.errors.push(args);

  return { device, recorded };
}

// Lets fire-and-forget promise chains (e.g. readAttribute callbacks) run to completion
async function flushAsync(rounds = 10) {
  for (let i = 0; i < rounds; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

// Waits until a condition holds, e.g. for work behind timers that flushAsync does not cover
async function waitFor(condition, { timeoutMs = 2000, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`${label} not met within ${timeoutMs} ms`);
    await new Promise(resolve => setTimeout(resolve, 1));
  }
}

module.exports = { createDevice, flushAsync, waitFor };
