'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode } = require('./helpers/zigbee');
const { createDevice } = require('./helpers/device');

const SONOFF = 0xFC11;
const SONOFF_MANUFACTURER_ID = 0x1286;
const CMD_PROTOCOL_DATA = 0x01;

// Expected payloads derived by hand from zigbee-herdsman-converters sonoff.ts (inchingControlSet):
// 01 17 07 80 | mode (0x80 enabled, 0x01 inching "on") | channel | time in 0.5 s units LE | 00 00 | XOR of bytes 0..9
const PAYLOAD_CASES = [
  {
    input: { enabled: true, mode: 'on', seconds: 5, channel: 0 },
    bytes: [0x01, 0x17, 0x07, 0x80, 0x81, 0x00, 0x0A, 0x00, 0x00, 0x00, 0x1A],
  },
  {
    input: { enabled: false, mode: 'off', seconds: 1.5, channel: 1 },
    bytes: [0x01, 0x17, 0x07, 0x80, 0x00, 0x01, 0x03, 0x00, 0x00, 0x00, 0x93],
  },
  {
    input: { enabled: true, mode: 'off', seconds: 3599.5, channel: 0 },
    bytes: [0x01, 0x17, 0x07, 0x80, 0x80, 0x00, 0x1F, 0x1C, 0x00, 0x00, 0x12],
  },
  {
    // The device needs at least one time unit
    input: { enabled: true, mode: 'on', seconds: 0, channel: 0 },
    bytes: [0x01, 0x17, 0x07, 0x80, 0x81, 0x00, 0x01, 0x00, 0x00, 0x00, 0x11],
  },
];

test('the inching payload matches the eWeLink protocol layout', () => {
  const { buildInchingPayload } = require('../lib/SonoffInching');

  for (const { input, bytes } of PAYLOAD_CASES) {
    assert.deepEqual([...buildInchingPayload(input)], bytes, JSON.stringify(input));
  }
});

test('invalid inching input is rejected instead of being sent', () => {
  const { buildInchingPayload } = require('../lib/SonoffInching');

  assert.throws(() => buildInchingPayload({ enabled: true, mode: 'sideways', seconds: 1 }), TypeError);
  assert.throws(() => buildInchingPayload({ enabled: 'yes', mode: 'on', seconds: 1 }), TypeError);
  assert.throws(() => buildInchingPayload({ enabled: true, mode: 'on', seconds: 40000 }), RangeError);
});

for (const driver of ['ZBMINIR2', 'ZBMicro', 'MINI-ZB2GS', 'MINI-ZBDIM']) {
  test(`${driver}: inching "on" for 5 s is sent as a manufacturer-specific protocolData command`, async () => {
    const DeviceClass = require(`../drivers/${driver}/device.js`);
    const { zclNode, sent } = createZigbeeNode({ endpoints: { 1: [0x0006, SONOFF], 2: [0x0006, SONOFF] } });
    const { device } = createDevice(DeviceClass, { zclNode });

    await device.setInching(true, 5, 'on');

    const commands = sent.filter(s => s.clusterId === SONOFF && s.frame.frameControl.clusterSpecific);
    assert.equal(commands.length, 1);
    const { endpointId, frame } = commands[0];
    assert.equal(endpointId, 1);
    assert.equal(frame.frameControl.manufacturerSpecific, true);
    assert.equal(frame.manufacturerId, SONOFF_MANUFACTURER_ID);
    assert.equal(frame.cmdId, CMD_PROTOCOL_DATA);
    assert.deepEqual([...frame.data], [0x01, 0x17, 0x07, 0x80, 0x81, 0x00, 0x0A, 0x00, 0x00, 0x00, 0x1A]);
  });
}
