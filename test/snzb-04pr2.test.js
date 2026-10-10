'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode } = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');

const SonoffBase = require('../drivers/sonoffbase');
const SNZB04PR2 = require('../drivers/SNZB-04PR2/device.js');

const SONOFF = 0xFC11;
const IAS_ZONE = 0x0500;
const TAMPER = 0x2000;
const UINT8 = 0x20;

test('SNZB-04PR2: the polled tamper state is shown as a boolean tamper alarm', async () => {
  const { zclNode } = createZigbeeNode({
    endpoints: { 1: [0x0001, IAS_ZONE, SONOFF] },
    attributeValues: { 1: { [SONOFF]: { [TAMPER]: Buffer.from([UINT8, 0x01]) } } },
  });
  const { device, recorded } = createDevice(SNZB04PR2, { zclNode, capabilities: { alarm_tamper: false } });

  await device.checkAttributes();

  assert.deepEqual(recorded.capabilityValues.filter(([id]) => id === 'alarm_tamper'), [['alarm_tamper', true]]);
});

test('SNZB-04PR2: handlers are only set up after the base initialisation has finished', async () => {
  const originalBaseInit = SonoffBase.prototype.onNodeInit;
  const events = [];
  let finishBaseInit;
  SonoffBase.prototype.onNodeInit = async function delayedBaseInit() {
    await new Promise(resolve => { finishBaseInit = resolve; });
    events.push('base initialised');
  };

  try {
    const { zclNode } = createZigbeeNode({ endpoints: { 1: [0x0001, IAS_ZONE, SONOFF] } });
    const { device } = createDevice(SNZB04PR2, { zclNode });
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
