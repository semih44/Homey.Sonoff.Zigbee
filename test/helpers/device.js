'use strict';

// homey-zigbeedriver: isFirstInit() is true until this store value is false
const FIRST_INIT_STORE_KEY = 'zb_first_init';

/**
 * Creates a driver instance without the Homey runtime. The SDK methods it calls come from the
 * Homey stand-in (test/helpers/homey-module.js) and record their effects for assertions.
 */
function createDevice(DeviceClass, {
  zclNode, settings = {}, capabilities = {}, store = {}, firstInit = false,
} = {}) {
  const device = Object.create(DeviceClass.prototype);
  const recorded = { settings: [], capabilityValues: [], errors: [] };

  device.__fake = {
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

module.exports = { createDevice, flushAsync };
