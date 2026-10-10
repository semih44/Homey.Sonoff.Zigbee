'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode, writtenAttribute, CMD_WRITE_ATTRIBUTES } = require('./helpers/zigbee');
const { createDevice } = require('./helpers/device');
const { endpointsFromCompose } = require('./helpers/compose');

const SONOFF = 0xFC11;
// eWeLink temperatureCalibration (0x2003, int16, 0.01 °C) per zigbee-herdsman-converters sonoff.ts
const TEMPERATURE_CALIBRATION = 0x2003;
const INT16 = 0x29;

for (const driver of ['SNZB-02B', 'SNZB-02D', 'SNZB-02DR2', 'SNZB-02P', 'SNZB-02WD']) {
  test(`${driver}: a temperature calibration of 1.5 °C reaches the device as 150`, async () => {
    const DeviceClass = require(`../drivers/${driver}/device.js`);
    // Only the clusters listed in the driver manifest exist on the device, as on Homey
    const { zclNode, sent } = createZigbeeNode({ endpoints: endpointsFromCompose(driver) });
    const { device } = createDevice(DeviceClass, { zclNode });

    await device.onSettings({
      oldSettings: {}, newSettings: { temperature_calibration: 1.5 }, changedKeys: ['temperature_calibration'],
    });

    const writes = sent.filter(s => s.clusterId === SONOFF && s.frame.cmdId === CMD_WRITE_ATTRIBUTES)
      .map(writtenAttribute);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].attributeId, TEMPERATURE_CALIBRATION);
    assert.equal(writes[0].dataTypeId, INT16);
    assert.deepEqual([...writes[0].valueBytes.subarray(0, 2)], [0x96, 0x00]);
  });
}
