'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const {
  createZigbeeNode, writtenAttribute, deliverAttributeReport, CMD_WRITE_ATTRIBUTES,
} = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');

const SONOFF = 0xFC11;
const SET_CALIBRATION_ACTION = 0x001D;
const CHAR_STR = 0x42;

// zigbee-herdsman-converters writes setCalibrationAction (CHAR_STR) from the arrays
// start [0x03, 0x01, 0x01, 0x01] / stop [0x03, 0x01, 0x01, 0x02]; for number arrays herdsman
// writes the bytes unchanged, so the leading 0x03 is the string length byte.
const CASES = [
  { action: 'start', wire: [0x03, 0x01, 0x01, 0x01] },
  { action: 'stop', wire: [0x03, 0x01, 0x01, 0x02] },
];

for (const { action, wire } of CASES) {
  test(`MINI-ZBDIM: calibration "${action}" is written as a 3-byte character string`, async () => {
    const DeviceClass = require('../drivers/MINI-ZBDIM/device.js');
    const { zclNode, sent } = createZigbeeNode({ endpoints: { 1: [0x0006, 0x0008, SONOFF] } });
    const { device } = createDevice(DeviceClass, { zclNode });

    await device.onSettings({
      oldSettings: {}, newSettings: { calibration_action: action }, changedKeys: ['calibration_action'],
    });

    const writes = sent
      .filter(s => s.clusterId === SONOFF && s.frame.cmdId === CMD_WRITE_ATTRIBUTES)
      .map(writtenAttribute);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].attributeId, SET_CALIBRATION_ACTION);
    assert.equal(writes[0].dataTypeId, CHAR_STR);
    assert.deepEqual([...writes[0].valueBytes.subarray(0, wire.length)], wire);
  });
}

// zigbee-herdsman-converters calibrationStatus (0x001E, uint8):
// 0 uncalibrated, 1 calibrating, 2 calibration failed, 3 calibrated
const CALIBRATION_STATUS = 0x001E;
const UINT8 = 0x20;

// Homey's i18n for the English locale, with dots for nested keys
function englishText(key) {
  return key.split('.').reduce((node, part) => (node ? node[part] : undefined), require('../locales/en.json'));
}

test('MINI-ZBDIM: the calibration status is shown as text, not as a number', async () => {
  const DeviceClass = require('../drivers/MINI-ZBDIM/device.js');
  const { zclNode } = createZigbeeNode({
    endpoints: { 1: [0x0006, 0x0008, SONOFF] },
    attributeValues: { 1: { [SONOFF]: { [CALIBRATION_STATUS]: Buffer.from([UINT8, 3]) } } },
  });
  const { device } = createDevice(DeviceClass, { zclNode });
  device.homey = { __: englishText };

  device.checkAttributes();
  await flushAsync();

  assert.equal(device.getSettings().calibration_status, 'Calibrated');
});

test('MINI-ZBDIM: a calibration status reported while calibrating is shown as text', async () => {
  const SonoffBase = require('../drivers/sonoffbase');
  const DeviceClass = require('../drivers/MINI-ZBDIM/device.js');
  const { zclNode, node } = createZigbeeNode({ endpoints: { 1: [0x0006, 0x0008, SONOFF] } });
  const { device } = createDevice(DeviceClass, { zclNode, node });
  device.homey = { __: englishText };
  device.registerCapability = () => {};
  device.configureAttributeReporting = async () => {};
  const originalBaseInit = SonoffBase.prototype.onNodeInit;
  SonoffBase.prototype.onNodeInit = async () => {};
  try {
    await device.onNodeInit({ zclNode });
  } finally {
    SonoffBase.prototype.onNodeInit = originalBaseInit;
  }

  await deliverAttributeReport(node, {
    endpointId: 1, clusterId: SONOFF, attributeId: CALIBRATION_STATUS, dataTypeId: UINT8, value: Buffer.from([1]),
  });
  await flushAsync();

  assert.equal(device.getSettings().calibration_status, 'Calibrating');
});
