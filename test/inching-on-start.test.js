'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode } = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');
const { endpointsFromCompose } = require('./helpers/compose');

const SonoffBase = require('../drivers/sonoffbase');

const SONOFF = 0xFC11;
const CMD_PROTOCOL_DATA = 0x01;
const INCHING = { inching_enabled: true, inching_time: 5, inching_mode: 'on' };

function protocolDataFrames(sent) {
  return sent.filter(s => s.clusterId === SONOFF && s.frame.frameControl.clusterSpecific && s.frame.cmdId === CMD_PROTOCOL_DATA);
}

// Runs onNodeInit with the base class and the capability registration stubbed
async function start(driver, { firstInit }) {
  const DeviceClass = require(`../drivers/${driver}/device.js`);
  const { zclNode, node, sent } = createZigbeeNode({ endpoints: endpointsFromCompose(driver) });
  const { device } = createDevice(DeviceClass, { zclNode, node, settings: INCHING, firstInit });
  device.homey = { flow: { getDeviceTriggerCard: () => ({ trigger: async () => {} }) } };
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
  return { sent };
}

// The device keeps its inching configuration; zigbee-herdsman-converters only sends it when set
for (const driver of ['ZBMINIR2', 'ZBMicro', 'MINI-ZBDIM']) {
  test(`${driver}: the inching setting is not sent again on every start`, async () => {
    const { sent } = await start(driver, { firstInit: false });

    assert.deepEqual(protocolDataFrames(sent), []);
  });

  test(`${driver}: a newly paired device gets its inching setting`, async () => {
    const { sent } = await start(driver, { firstInit: true });

    assert.equal(protocolDataFrames(sent).length, 1);
  });
}
