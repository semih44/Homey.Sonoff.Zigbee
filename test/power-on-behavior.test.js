'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode, writtenAttribute, CMD_WRITE_ATTRIBUTES } = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');

const ON_OFF = 0x0006;
const ALL_CLUSTERS = [0x0000, 0x0006, 0x0008, 0x0702, 0x0B04, 0xFC11];

// ZCL On/Off cluster StartUpOnOff attribute (enum8): 0x00 off, 0x01 on, 0xFF previous state
const START_UP_ON_OFF = 0x4003;
const ENUM8 = 0x30;

const SINGLE_ENDPOINT_DRIVERS = [
  'BASICZBR3', 'ZBMINI', 'ZBMINIL', 'ZBMINIL2', 'S26R2ZB', 'S31ZB', 'SA-028', 'SA-029', 'S40ZBTPB',
  'S60ZBTPF', 'S60ZBTPG', 'ZBMicro', 'ZBMINIR2', 'MINI-ZBDIM', 'ZBM5-1C-80', 'ZBM5-1C-120',
];

const CHANNELS_PER_DRIVER = {
  'MINI-ZB2GS': 2,
  'MINI-ZB2GS-L': 2,
  'ZBM5-2C-80': 2,
  'ZBM5-2C-120': 2,
  'ZBM5-3C-80': 3,
  'ZBM5-3C-120': 3,
};

function powerOnWrites(sent) {
  return sent.filter(s => s.clusterId === ON_OFF && s.frame.cmdId === CMD_WRITE_ATTRIBUTES);
}

for (const driver of SINGLE_ENDPOINT_DRIVERS) {
  const DeviceClass = require(`../drivers/${driver}/device.js`);

  test(`${driver}: power-on behavior "last_state" is written to the device as StartUpOnOff 0xFF`, async () => {
    const { zclNode, sent } = createZigbeeNode({ endpoints: { 1: ALL_CLUSTERS } });
    const { device } = createDevice(DeviceClass, { zclNode });

    await device.onSettings({
      oldSettings: {}, newSettings: { power_on_behavior: 'last_state' }, changedKeys: ['power_on_behavior'],
    });

    const writes = powerOnWrites(sent);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].endpointId, 1);
    const { attributeId, dataTypeId, valueBytes } = writtenAttribute(writes[0]);
    assert.equal(attributeId, START_UP_ON_OFF);
    assert.equal(dataTypeId, ENUM8);
    assert.equal(valueBytes[0], 0xff);
  });

  test(`${driver}: a power-on behavior change is rejected when the device is unreachable`, async () => {
    const { zclNode } = createZigbeeNode({ endpoints: { 1: ALL_CLUSTERS }, failSend: true });
    const { device } = createDevice(DeviceClass, { zclNode });

    await assert.rejects(device.onSettings({
      oldSettings: {}, newSettings: { power_on_behavior: 'on' }, changedKeys: ['power_on_behavior'],
    }));
  });

  test(`${driver}: the power-on behavior reported by the device is shown in the settings`, async () => {
    const { zclNode } = createZigbeeNode({
      endpoints: { 1: ALL_CLUSTERS },
      attributeValues: { 1: { [ON_OFF]: { [START_UP_ON_OFF]: Buffer.from([ENUM8, 0xff]) } } },
    });
    const { device } = createDevice(DeviceClass, { zclNode });

    device.checkAttributes();
    await flushAsync();

    assert.equal(device.getSettings().power_on_behavior, 'last_state');
  });
}

for (const [driver, channels] of Object.entries(CHANNELS_PER_DRIVER)) {
  const DeviceClass = require(`../drivers/${driver}/device.js`);
  const endpoints = Object.fromEntries(Array.from({ length: channels }, (_, i) => [i + 1, [ON_OFF, 0xFC11]]));

  test(`${driver}: the power-on behavior of channel ${channels} is written to endpoint ${channels}`, async () => {
    const { zclNode, sent } = createZigbeeNode({ endpoints });
    const { device } = createDevice(DeviceClass, { zclNode });
    const key = `power_on_behavior_l${channels}`;

    await device.onSettings({ oldSettings: {}, newSettings: { [key]: 'off' }, changedKeys: [key] });

    const writes = powerOnWrites(sent);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].endpointId, channels);
    const { attributeId, valueBytes } = writtenAttribute(writes[0]);
    assert.equal(attributeId, START_UP_ON_OFF);
    assert.equal(valueBytes[0], 0x00);
  });

  test(`${driver}: each channel shows the power-on behavior of its own endpoint`, async () => {
    const reported = { 1: 0x01, 2: 0x00, 3: 0xff };
    const expected = { 1: 'on', 2: 'off', 3: 'last_state' };
    const attributeValues = Object.fromEntries(Object.keys(endpoints).map(ep => [
      ep, { [ON_OFF]: { [START_UP_ON_OFF]: Buffer.from([ENUM8, reported[ep]]) } },
    ]));
    const { zclNode } = createZigbeeNode({ endpoints, attributeValues });
    const { device } = createDevice(DeviceClass, { zclNode });

    device.checkAttributes();
    await flushAsync();

    const shown = device.getSettings();
    for (let channel = 1; channel <= channels; channel++) {
      assert.equal(shown[`power_on_behavior_l${channel}`], expected[channel], `channel ${channel}`);
    }
  });
}
