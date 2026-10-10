'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode, writtenAttribute, CMD_WRITE_ATTRIBUTES } = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');

const MINIZBRBS = require('../drivers/MINI-ZBRBS/device.js');

const WINDOW_COVERING = 0x0102;
const SONOFF = 0xFC11;
const MOTOR_CALIBRATION_ACTION = 0x5001;
const UNSUPPORTED_ATTRIBUTE = 0x86;

// Homey timers are recorded instead of run, so long polling delays do not keep the test alive
function fakeHomeyTimers() {
  const timers = [];
  return { timers, homey: { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; } } };
}

test('MINI-ZBRBS: a calibration command the device rejects fails the settings change', async () => {
  const { zclNode } = createZigbeeNode({
    endpoints: { 1: [WINDOW_COVERING, SONOFF] },
    rejectedWrites: { 1: { [SONOFF]: { [MOTOR_CALIBRATION_ACTION]: UNSUPPORTED_ATTRIBUTE } } },
  });
  const { device } = createDevice(MINIZBRBS, { zclNode });
  device.homey = fakeHomeyTimers().homey;

  await assert.rejects(device.onSettings({
    oldSettings: {}, newSettings: { motor_calibration_action: '2' }, changedKeys: ['motor_calibration_action'],
  }), error => error.message.includes('UNSUPPORTED_ATTRIBUTE'));
});

test('MINI-ZBRBS: the calibration dropdown is reset only after Homey has stored the settings', async () => {
  const { zclNode, sent } = createZigbeeNode({ endpoints: { 1: [WINDOW_COVERING, SONOFF] } });
  const { device, recorded } = createDevice(MINIZBRBS, { zclNode });
  const { homey, timers } = fakeHomeyTimers();
  device.homey = homey;

  await device.onSettings({
    oldSettings: {}, newSettings: { motor_calibration_action: '2' }, changedKeys: ['motor_calibration_action'],
  });

  const written = sent.filter(s => s.clusterId === SONOFF && s.frame.cmdId === CMD_WRITE_ATTRIBUTES).map(writtenAttribute);
  assert.deepEqual(written.map(w => [w.attributeId, w.valueBytes[0]]), [[MOTOR_CALIBRATION_ACTION, 2]]);
  // Homey applies newSettings after onSettings returns, so a reset inside onSettings would be overwritten
  assert.deepEqual(recorded.settings.filter(s => 'motor_calibration_action' in s), []);

  for (const { fn } of timers) fn();
  await flushAsync();
  assert.deepEqual(recorded.settings.filter(s => 'motor_calibration_action' in s), [{ motor_calibration_action: '0' }]);
});
