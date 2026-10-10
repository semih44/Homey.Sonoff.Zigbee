'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode, writtenAttribute, CMD_WRITE_ATTRIBUTES } = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');

const SONOFF = 0xFC11;
const ON_OFF = 0x0006;
// eWeLink attributes: 0x0014 delayed power-on enabled (bool), 0x0015 delay in 0.5 s units (uint16).
// Reference: zigbee-herdsman-converters sonoff.ts exposes delayedPowerOnTime with scale 2.
const DELAY_STATE = 0x0014;
const DELAY_TIME = 0x0015;
const BOOL = 0x10;
const UINT16 = 0x21;

function delayTimeWrites(sent) {
  return sent
    .filter(s => s.clusterId === SONOFF && s.frame.cmdId === CMD_WRITE_ATTRIBUTES)
    .map(s => ({ endpointId: s.endpointId, ...writtenAttribute(s) }))
    .filter(w => w.attributeId === DELAY_TIME);
}

const WRITE_CASES = [
  { driver: 'MINI-ZB2GS', key: 'delayed_power_on_time_l2', endpointId: 2 },
  { driver: 'MINI-ZB2GS-L', key: 'delayed_power_on_time_l2', endpointId: 2 },
  { driver: 'ZBMINIR2', key: 'power_on_delay_time', endpointId: 1 },
  { driver: 'MINI-ZBDIM', key: 'delayed_power_on_time', endpointId: 1 },
];

for (const { driver, key, endpointId } of WRITE_CASES) {
  test(`${driver}: a delayed power-on of 10 s is written as 20 half-second units to endpoint ${endpointId}`, async () => {
    const DeviceClass = require(`../drivers/${driver}/device.js`);
    const { zclNode, sent } = createZigbeeNode({ endpoints: { 1: [ON_OFF, SONOFF], 2: [ON_OFF, SONOFF] } });
    const { device } = createDevice(DeviceClass, { zclNode });

    await device.onSettings({ oldSettings: {}, newSettings: { [key]: 10 }, changedKeys: [key] });

    const writes = delayTimeWrites(sent);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].endpointId, endpointId);
    assert.equal(writes[0].dataTypeId, UINT16);
    assert.deepEqual([...writes[0].valueBytes.subarray(0, 2)], [20, 0]);
  });
}

const SINGLE_CHANNEL_READ_CASES = [
  { driver: 'ZBMINIR2', key: 'power_on_delay_time' },
  { driver: 'MINI-ZBDIM', key: 'delayed_power_on_time' },
];

for (const { driver, key } of SINGLE_CHANNEL_READ_CASES) {
  test(`${driver}: a reported delay of 20 half-second units is shown as 10 s`, async () => {
    const DeviceClass = require(`../drivers/${driver}/device.js`);
    const { zclNode } = createZigbeeNode({
      endpoints: { 1: [ON_OFF, SONOFF] },
      attributeValues: { 1: { [SONOFF]: { [DELAY_TIME]: Buffer.from([UINT16, 20, 0]) } } },
    });
    const { device } = createDevice(DeviceClass, { zclNode });

    device.checkAttributes();
    await flushAsync();

    assert.equal(device.getSettings()[key], 10);
  });
}

for (const driver of ['MINI-ZB2GS', 'MINI-ZB2GS-L']) {
  test(`${driver}: each channel shows the delayed power-on of its own endpoint`, async () => {
    const DeviceClass = require(`../drivers/${driver}/device.js`);
    const { zclNode } = createZigbeeNode({
      endpoints: { 1: [ON_OFF, SONOFF], 2: [ON_OFF, SONOFF] },
      attributeValues: {
        1: { [SONOFF]: { [DELAY_STATE]: Buffer.from([BOOL, 1]), [DELAY_TIME]: Buffer.from([UINT16, 6, 0]) } },
        2: { [SONOFF]: { [DELAY_STATE]: Buffer.from([BOOL, 0]), [DELAY_TIME]: Buffer.from([UINT16, 20, 0]) } },
      },
    });
    const { device } = createDevice(DeviceClass, { zclNode });

    device.checkAttributes();
    await flushAsync();

    const shown = device.getSettings();
    assert.equal(shown.delayed_power_on_state_l1, true);
    assert.equal(shown.delayed_power_on_time_l1, 3);
    assert.equal(shown.delayed_power_on_state_l2, false);
    assert.equal(shown.delayed_power_on_time_l2, 10);
  });
}
