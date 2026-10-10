'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode, writtenAttribute, CMD_WRITE_ATTRIBUTES } = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');

const ON_OFF = 0x0006;
const SONOFF = 0xFC11;
// eWeLink detachRelayMode2 (0x0019) is a BITMAP8 in zigbee-herdsman-converters: bit 0..2 = outlet 1..3
const DETACH_RELAY_MODE2 = 0x0019;
const MAP8 = 0x18;

const CASES = [
  { driver: 'MINI-ZB2GS', channels: 2, settings: { detach_relay_1: false, detach_relay_2: true }, wire: 0x02,
    reported: 0x03, shown: { detach_relay_1: true, detach_relay_2: true } },
  { driver: 'MINI-ZB2GS-L', channels: 2, settings: { detach_relay_1: false, detach_relay_2: true }, wire: 0x02,
    reported: 0x01, shown: { detach_relay_1: true, detach_relay_2: false } },
  { driver: 'ZBM5-1C-80', channels: 1, settings: { detach_relay: true }, wire: 0x01,
    reported: 0x01, shown: { detach_relay: true } },
  { driver: 'ZBM5-1C-120', channels: 1, settings: { detach_relay: true }, wire: 0x01,
    reported: 0x00, shown: { detach_relay: false } },
  { driver: 'ZBM5-2C-80', channels: 2, settings: { detach_relay_1: true, detach_relay_2: true }, wire: 0x03,
    reported: 0x02, shown: { detach_relay_1: false, detach_relay_2: true } },
  { driver: 'ZBM5-2C-120', channels: 2, settings: { detach_relay_1: true, detach_relay_2: false }, wire: 0x01,
    reported: 0x02, shown: { detach_relay_1: false, detach_relay_2: true } },
  { driver: 'ZBM5-3C-80', channels: 3, settings: { detach_relay_1: false, detach_relay_2: false, detach_relay_3: true },
    wire: 0x04, reported: 0x05, shown: { detach_relay_1: true, detach_relay_2: false, detach_relay_3: true } },
  { driver: 'ZBM5-3C-120', channels: 3, settings: { detach_relay_1: true, detach_relay_2: true, detach_relay_3: true },
    wire: 0x07, reported: 0x04, shown: { detach_relay_1: false, detach_relay_2: false, detach_relay_3: true } },
];

for (const { driver, channels, settings, wire, reported, shown } of CASES) {
  const DeviceClass = require(`../drivers/${driver}/device.js`);
  const endpoints = Object.fromEntries(Array.from({ length: channels }, (_, i) => [i + 1, [ON_OFF, SONOFF]]));

  test(`${driver}: detached relays are written as a BITMAP8 of 0x0${wire.toString(16)}`, async () => {
    const { zclNode, sent } = createZigbeeNode({ endpoints });
    const { device } = createDevice(DeviceClass, { zclNode });

    await device.onSettings({ oldSettings: {}, newSettings: settings, changedKeys: Object.keys(settings) });

    const writes = sent.filter(s => s.clusterId === SONOFF && s.frame.cmdId === CMD_WRITE_ATTRIBUTES)
      .map(writtenAttribute).filter(w => w.attributeId === DETACH_RELAY_MODE2);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].dataTypeId, MAP8);
    assert.equal(writes[0].valueBytes[0], wire);
  });

  test(`${driver}: a reported detach bitmap of 0x0${reported.toString(16)} is shown per channel`, async () => {
    const { zclNode } = createZigbeeNode({
      endpoints,
      attributeValues: { 1: { [SONOFF]: { [DETACH_RELAY_MODE2]: Buffer.from([MAP8, reported]) } } },
    });
    const { device } = createDevice(DeviceClass, { zclNode });

    device.checkAttributes();
    await flushAsync();

    const current = device.getSettings();
    for (const [key, value] of Object.entries(shown)) {
      assert.equal(current[key], value, key);
    }
  });
}
