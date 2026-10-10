'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode, writtenAttribute, CMD_WRITE_ATTRIBUTES } = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');

const ON_OFF = 0x0006;
const WINDOW_COVERING = 0x0102;
const SONOFF = 0xFC11;
const SONOFF_MANUFACTURER_ID = 0x1286;
const CMD_READ_ATTRIBUTES = 0x00;
// eWeLink radio power (0x0012, int16): 0x09 normal, 0x14 turbo (zigbee-herdsman-converters sonoff.ts).
// ZBMicro is the only model z2m addresses with the manufacturer code (radioPowerWithManuCode).
const RADIO_POWER = 0x0012;
const INT16 = 0x29;

const CASES = [
  { driver: 'ZBMINIR2', clusters: [ON_OFF, SONOFF], manufacturerSpecific: false },
  { driver: 'MINI-ZB2GS', clusters: [ON_OFF, SONOFF], manufacturerSpecific: false },
  { driver: 'MINI-ZBRBS', clusters: [WINDOW_COVERING, SONOFF], manufacturerSpecific: false },
  { driver: 'ZBMicro', clusters: [ON_OFF, SONOFF], manufacturerSpecific: true },
];

function sonoffFrames(sent, cmdId) {
  return sent.filter(s => s.clusterId === SONOFF && !s.frame.frameControl.clusterSpecific && s.frame.cmdId === cmdId);
}

for (const { driver, clusters, manufacturerSpecific } of CASES) {
  const DeviceClass = require(`../drivers/${driver}/device.js`);

  test(`${driver}: turbo mode on is written as radio power 0x14`, async () => {
    const { zclNode, sent } = createZigbeeNode({ endpoints: { 1: clusters, 2: clusters } });
    const { device } = createDevice(DeviceClass, { zclNode });

    await device.onSettings({ oldSettings: {}, newSettings: { turbo_mode: true }, changedKeys: ['turbo_mode'] });

    const writes = sonoffFrames(sent, CMD_WRITE_ATTRIBUTES);
    assert.equal(writes.length, 1);
    const { attributeId, dataTypeId, valueBytes } = writtenAttribute(writes[0]);
    assert.equal(attributeId, RADIO_POWER);
    assert.equal(dataTypeId, INT16);
    assert.deepEqual([...valueBytes.subarray(0, 2)], [0x14, 0x00]);
    assert.equal(writes[0].frame.frameControl.manufacturerSpecific, manufacturerSpecific);
    if (manufacturerSpecific) assert.equal(writes[0].frame.manufacturerId, SONOFF_MANUFACTURER_ID);
  });

  test(`${driver}: a reported radio power of 0x14 shows turbo mode as on`, async () => {
    const { zclNode, sent } = createZigbeeNode({
      endpoints: { 1: clusters, 2: clusters },
      attributeValues: { 1: { [SONOFF]: { [RADIO_POWER]: Buffer.from([INT16, 0x14, 0x00]) } } },
    });
    const { device } = createDevice(DeviceClass, { zclNode });

    device.checkAttributes();
    await flushAsync();

    assert.equal(device.getSettings().turbo_mode, true);
    const radioPowerReads = sonoffFrames(sent, CMD_READ_ATTRIBUTES)
      .filter(s => s.frame.data.readUInt16LE(0) === RADIO_POWER || s.frame.data.includes(RADIO_POWER));
    assert.ok(radioPowerReads.length > 0, 'radio power must be read');
    for (const read of radioPowerReads) {
      assert.equal(read.frame.frameControl.manufacturerSpecific, manufacturerSpecific);
    }
  });
}
