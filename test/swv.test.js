'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode } = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');
const { endpointsFromCompose } = require('./helpers/compose');

const SonoffBase = require('../drivers/sonoffbase');

const SONOFF = 0xFC11;
const CMD_READ_ATTRIBUTES = 0x00;
// eWeLink child lock 0x0000 (bool); valve abnormal state 0x500C (uint8), which
// zigbee-herdsman-converters only knows for the SWV and the SWV-ZFE/ZFU with flow meter
const CHILD_LOCK = 0x0000;
const VALVE_ABNORMAL_STATE = 0x500C;

// Attribute ids of all read requests sent to the eWeLink cluster
function sonoffReads(sent) {
  return sent.filter(s => s.clusterId === SONOFF && s.frame.cmdId === CMD_READ_ATTRIBUTES)
    .flatMap(s => Array.from({ length: s.frame.data.length / 2 }, (_, i) => s.frame.data.readUInt16LE(i * 2)));
}

// Runs onNodeInit with the base class stubbed
async function init(device, zclNode) {
  device.registerCapability = () => {};
  device.configureAttributeReporting = async () => {};
  const originalBaseInit = SonoffBase.prototype.onNodeInit;
  SonoffBase.prototype.onNodeInit = async () => {};
  try {
    await device.onNodeInit({ zclNode });
  } finally {
    SonoffBase.prototype.onNodeInit = originalBaseInit;
  }
  await flushAsync();
}

// zigbee-herdsman-converters SWV-ZNE (white label SWV-ZNU): no flow meter, hence no leak or
// water shortage state; ZHA only reads 0x500C on the SWV
for (const driver of ['SWV-ZNE', 'SWV-ZNU']) {
  const DeviceClass = require(`../drivers/${driver}/device.js`);

  test(`${driver}: no water alarm is offered, the valve has no flow meter to detect leaks`, () => {
    const manifest = require(`../drivers/${driver}/driver.compose.json`);

    assert.equal(manifest.capabilities.includes('alarm_water'), false);
  });

  test(`${driver}: a valve paired with an older version loses the water alarm`, async () => {
    const { zclNode } = createZigbeeNode({ endpoints: endpointsFromCompose(driver) });
    const { device } = createDevice(DeviceClass, {
      zclNode, capabilities: { onoff: false, measure_battery: 100, alarm_water: false },
    });

    await init(device, zclNode);

    assert.equal(device.hasCapability('alarm_water'), false);
  });

  test(`${driver}: only the child lock is read, not a valve state it does not have`, async () => {
    const { zclNode, sent } = createZigbeeNode({ endpoints: endpointsFromCompose(driver) });
    const { device } = createDevice(DeviceClass, { zclNode, capabilities: { onoff: false, measure_battery: 100 } });

    await init(device, zclNode);

    assert.deepEqual(sonoffReads(sent), [CHILD_LOCK]);
    assert.equal(sonoffReads(sent).includes(VALVE_ABNORMAL_STATE), false);
  });
}
