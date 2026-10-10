'use strict';

// Minimal stand-in for the Homey SDK module, which only exists inside the Homey runtime.
// Device SDK methods live on the prototype, like in Homey, so driver overrides (e.g. a custom
// setSettings) are exercised and can call super. Their state is set up by test/helpers/device.js.

class SimpleClass {}

class Device extends SimpleClass {

  getData() {
    return { ...this.__fake.data };
  }

  getSettings() {
    return { ...this.__fake.settings };
  }

  getSetting(key) {
    return this.__fake.settings[key];
  }

  async setSettings(values) {
    this.__fake.recorded.settings.push(values);
    Object.assign(this.__fake.settings, values);
  }

  hasCapability(id) {
    return id in this.__fake.capabilities;
  }

  getCapabilityValue(id) {
    return this.__fake.capabilities[id];
  }

  async setCapabilityValue(id, value) {
    this.__fake.recorded.capabilityValues.push([id, value]);
    this.__fake.capabilities[id] = value;
  }

  registerCapabilityListener(id, listener) {
    this.__fake.capabilityListeners[id] = listener;
  }

  // As in Homey: runs the listener (like a change in the app) and stores the value once it succeeded
  async triggerCapabilityListener(id, value, opts = {}) {
    const listener = this.__fake.capabilityListeners[id];
    if (!listener) throw new Error(`No listener registered for ${id}`);
    await listener(value, opts);
    this.__fake.capabilities[id] = value;
  }

  async addCapability(id) {
    if (!(id in this.__fake.capabilities)) this.__fake.capabilities[id] = null;
  }

  async removeCapability(id) {
    delete this.__fake.capabilities[id];
  }

  getStoreValue(key) {
    return this.__fake.store[key];
  }

  async setStoreValue(key, value) {
    this.__fake.store[key] = value;
  }

}

class Driver extends SimpleClass {}
class App extends SimpleClass {}

module.exports = {
  SimpleClass,
  Device,
  Driver,
  App,
};
