'use strict';

/**
 * Creates a driver instance without the Homey runtime. Only the SDK methods the driver code
 * calls are provided, and their effects are recorded for assertions.
 */
function createDevice(DeviceClass, {
  zclNode, settings = {}, capabilities = {}, store = {}, firstInit = false,
} = {}) {
  const device = Object.create(DeviceClass.prototype);
  const recorded = { settings: [], capabilityValues: [], errors: [] };
  const currentSettings = { ...settings };
  const capabilityValues = { ...capabilities };
  const storeValues = { ...store };

  Object.assign(device, {
    zclNode,
    log() {},
    error: (...args) => recorded.errors.push(args),
    getSettings: () => ({ ...currentSettings }),
    getSetting: key => currentSettings[key],
    async setSettings(values) {
      recorded.settings.push(values);
      Object.assign(currentSettings, values);
    },
    getStoreValue: key => storeValues[key],
    async setStoreValue(key, value) { storeValues[key] = value; },
    isFirstInit: () => firstInit,
    hasCapability: id => id in capabilityValues,
    getCapabilityValue: id => capabilityValues[id],
    async setCapabilityValue(id, value) {
      recorded.capabilityValues.push([id, value]);
      capabilityValues[id] = value;
    },
  });

  return { device, recorded };
}

// Lets fire-and-forget promise chains (e.g. readAttribute callbacks) run to completion
async function flushAsync(rounds = 10) {
  for (let i = 0; i < rounds; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

module.exports = { createDevice, flushAsync };
