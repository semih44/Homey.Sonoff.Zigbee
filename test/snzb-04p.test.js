'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode } = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');

const SonoffBase = require('../drivers/sonoffbase');

const SONOFF = 0xFC11;
const IAS_ZONE = 0x0500;
const TAMPER = 0x2000;
const UINT8 = 0x20;

// Both generations of the contact sensor share the same clusters and handling
for (const driver of ['SNZB-04P', 'SNZB-04PR2']) {
  const DeviceClass = require(`../drivers/${driver}/device.js`);

  test(`${driver}: the polled tamper state is shown as a boolean tamper alarm`, async () => {
    const { zclNode } = createZigbeeNode({
      endpoints: { 1: [0x0001, IAS_ZONE, SONOFF] },
      attributeValues: { 1: { [SONOFF]: { [TAMPER]: Buffer.from([UINT8, 0x01]) } } },
    });
    const { device, recorded } = createDevice(DeviceClass, { zclNode, capabilities: { alarm_tamper: false } });

    await device.checkAttributes();

    assert.deepEqual(recorded.capabilityValues.filter(([id]) => id === 'alarm_tamper'), [['alarm_tamper', true]]);
  });

  test(`${driver}: handlers are only set up after the base initialisation has finished`, async () => {
    const originalBaseInit = SonoffBase.prototype.onNodeInit;
    const events = [];
    let finishBaseInit;
    SonoffBase.prototype.onNodeInit = async function delayedBaseInit() {
      await new Promise(resolve => { finishBaseInit = resolve; });
      events.push('base initialised');
    };

    try {
      const { zclNode } = createZigbeeNode({ endpoints: { 1: [0x0001, IAS_ZONE, SONOFF] } });
      const { device } = createDevice(DeviceClass, { zclNode });
      device.registerCapability = () => events.push('capability registered');

      const init = device.onNodeInit({ zclNode });
      await flushAsync();
      assert.deepEqual(events, [], 'nothing may be registered while the base is still initialising');

      finishBaseInit();
      await init;
      assert.deepEqual(events, ['base initialised', 'capability registered']);
    } finally {
      SonoffBase.prototype.onNodeInit = originalBaseInit;
    }
  });
}
