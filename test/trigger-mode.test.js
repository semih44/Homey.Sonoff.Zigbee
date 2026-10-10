'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode, writtenAttribute, CMD_WRITE_ATTRIBUTES } = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');
const { endpointsFromCompose } = require('./helpers/compose');

const SONOFF = 0xFC11;
// eWeLink externalTriggerMode 0x0016 (uint8); zigbee-herdsman-converters for MINI-ZB2GS(-L):
// edge 0, pulse 1, following(off) 2, following(on) 130, per channel endpoint
const EXTERNAL_TRIGGER_MODE = 0x0016;
const UINT8 = 0x20;

for (const driver of ['MINI-ZB2GS', 'MINI-ZB2GS-L']) {
  const DeviceClass = require(`../drivers/${driver}/device.js`);

  test(`${driver}: the trigger mode of each channel is read back from its endpoint`, async () => {
    const { zclNode } = createZigbeeNode({
      endpoints: endpointsFromCompose(driver),
      attributeValues: {
        1: { [SONOFF]: { [EXTERNAL_TRIGGER_MODE]: Buffer.from([UINT8, 1]) } },
        2: { [SONOFF]: { [EXTERNAL_TRIGGER_MODE]: Buffer.from([UINT8, 130]) } },
      },
    });
    const { device } = createDevice(DeviceClass, { zclNode });

    device.checkAttributes();
    await flushAsync();

    assert.equal(device.getSettings().external_trigger_mode_l1, '1');
    assert.equal(device.getSettings().external_trigger_mode_l2, '130');
  });

  test(`${driver}: following (on) for channel 2 is written as 130 to endpoint 2`, async () => {
    const { zclNode, sent } = createZigbeeNode({ endpoints: endpointsFromCompose(driver) });
    const { device } = createDevice(DeviceClass, { zclNode });

    await device.onSettings({
      oldSettings: {}, newSettings: { external_trigger_mode_l2: '130' }, changedKeys: ['external_trigger_mode_l2'],
    });

    const writes = sent.filter(s => s.clusterId === SONOFF && s.frame.cmdId === CMD_WRITE_ATTRIBUTES);
    assert.deepEqual(writes.map(s => s.endpointId), [2]);
    const write = writtenAttribute(writes[0]);
    assert.equal(write.attributeId, EXTERNAL_TRIGGER_MODE);
    assert.equal(write.dataTypeId, UINT8);
    assert.equal(write.valueBytes[0], 130);
  });
}
