'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createDevice } = require('./helpers/device');

const SonoffBase = require('../drivers/sonoffbase');

// Zigbee standard (and homey-zigbeedriver, zigbee-herdsman-converters): lift percentage 0 = open, 100 = closed.
// Homey windowcoverings_set: 1 = open, 0 = closed.

// Initialises the device with the base class stubbed and returns the windowcoverings_set parsers it registered
async function initAndCaptureParsers(device) {
  const registered = {};
  device.registerCapability = (capability, cluster, options) => { registered[capability] = options; };
  device.checkAttributes = () => {};
  const originalBaseInit = SonoffBase.prototype.onNodeInit;
  SonoffBase.prototype.onNodeInit = async () => {};
  try {
    await device.onNodeInit({ zclNode: {} });
  } finally {
    SonoffBase.prototype.onNodeInit = originalBaseInit;
  }
  const { setParser, reportParser } = registered.windowcoverings_set;
  return {
    liftFor: value => setParser.call(device, value).percentageLiftValue,
    valueFor: lift => reportParser.call(device, lift),
  };
}

test('ZBCurtain: open and closed follow the Zigbee lift percentage', async () => {
  const ZBCurtain = require('../drivers/ZBCurtain/device.js');
  const { device } = createDevice(ZBCurtain);
  const { liftFor, valueFor } = await initAndCaptureParsers(device);

  assert.equal(liftFor(1), 0);
  assert.equal(liftFor(0), 100);
  assert.equal(liftFor(0.25), 75);
  assert.equal(valueFor(0), 1);
  assert.equal(valueFor(100), 0);
});

test('MINI-ZBRBS: a newly paired module follows the Zigbee lift percentage', async () => {
  const MINIZBRBS = require('../drivers/MINI-ZBRBS/device.js');
  const { device } = createDevice(MINIZBRBS, { settings: { invert_cover: false }, firstInit: true });
  const { liftFor, valueFor } = await initAndCaptureParsers(device);

  assert.equal(device.getSetting('invert_cover'), false);
  assert.equal(liftFor(1), 0);
  assert.equal(liftFor(0.25), 75);
  assert.equal(valueFor(0), 1);
});

test('MINI-ZBRBS: "invert" reverses the standard direction', async () => {
  const MINIZBRBS = require('../drivers/MINI-ZBRBS/device.js');
  const { device } = createDevice(MINIZBRBS, {
    settings: { invert_cover: true }, store: { coverDirection: 'zigbee-standard' },
  });
  const { liftFor, valueFor } = await initAndCaptureParsers(device);

  assert.equal(liftFor(1), 100);
  assert.equal(valueFor(100), 1);
});

// Before the fix the module computed lift = invert ? (1 - value) : value
for (const invertBefore of [true, false]) {
  test(`MINI-ZBRBS: an existing module with invert=${invertBefore} keeps moving exactly as before`, async () => {
    const MINIZBRBS = require('../drivers/MINI-ZBRBS/device.js');
    const { device } = createDevice(MINIZBRBS, { settings: { invert_cover: invertBefore } });
    const { liftFor, valueFor } = await initAndCaptureParsers(device);

    for (const value of [0, 0.25, 1]) {
      const liftBefore = Math.round((invertBefore ? 1 - value : value) * 100);
      assert.equal(liftFor(value), liftBefore, `Homey value ${value}`);
    }
    for (const lift of [0, 30, 100]) {
      const valueBefore = invertBefore ? 1 - lift / 100 : lift / 100;
      assert.equal(valueFor(lift), valueBefore, `lift ${lift}`);
    }
  });
}

test('MINI-ZBRBS: the existing setting is converted only once', async () => {
  const MINIZBRBS = require('../drivers/MINI-ZBRBS/device.js');
  const { device } = createDevice(MINIZBRBS, { settings: { invert_cover: true } });

  await initAndCaptureParsers(device);
  const afterFirstInit = device.getSetting('invert_cover');
  await initAndCaptureParsers(device);

  assert.equal(device.getSetting('invert_cover'), afterFirstInit);
});
