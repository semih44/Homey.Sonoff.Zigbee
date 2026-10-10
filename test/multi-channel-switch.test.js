'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode, deliverAttributeReport } = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');
const { endpointsFromCompose, capabilitiesFromCompose } = require('./helpers/compose');

const SonoffBase = require('../drivers/sonoffbase');

const ON_OFF = 0x0006;
const CMD_OFF = 0x00;
const CMD_ON = 0x01;
const ON_OFF_ATTRIBUTE = 0x0000;
const BOOL = 0x10;

// Channel n is onoff (n = 1) or onoff.channel_<n> on endpoint n
const CHANNELS = {
  'MINI-ZB2GS': 2, 'MINI-ZB2GS-L': 2, 'ZBM5-2C-80': 2, 'ZBM5-2C-120': 2, 'ZBM5-3C-80': 3, 'ZBM5-3C-120': 3,
};

// A paired switch with all channels off, initialised with the real capability registration of homey-zigbeedriver
async function startSwitch(driver) {
  const DeviceClass = require(`../drivers/${driver}/device.js`);
  const { zclNode, node, sent } = createZigbeeNode({ endpoints: endpointsFromCompose(driver) });
  const capabilities = Object.fromEntries(Object.keys(capabilitiesFromCompose(driver)).map(id => [id, false]));
  const { device, recorded } = createDevice(DeviceClass, { zclNode, node, capabilities });
  device.homey = { flow: { getDeviceTriggerCard: () => ({ trigger: async () => {} }) } };

  const originalBaseInit = SonoffBase.prototype.onNodeInit;
  SonoffBase.prototype.onNodeInit = async () => {};
  try {
    await device.onNodeInit({ zclNode });
  } finally {
    SonoffBase.prototype.onNodeInit = originalBaseInit;
  }
  await flushAsync();
  sent.length = 0;
  return { device, recorded, node, sent };
}

function onOffCommands(sent) {
  return sent.filter(s => s.clusterId === ON_OFF && s.frame.frameControl.clusterSpecific)
    .map(s => [s.endpointId, s.frame.cmdId]);
}

// homey-zigbeedriver 1.6 finds its onoff configuration only for the capability id "onoff" itself,
// a sub-capability like onoff.channel_2 got none: no command when switched, no state from reports
for (const [driver, channels] of Object.entries(CHANNELS)) {
  for (let channel = 2; channel <= channels; channel++) {
    const capability = `onoff.channel_${channel}`;

    test(`${driver}: switching channel ${channel} in Homey switches endpoint ${channel}`, async () => {
      const { device, sent } = await startSwitch(driver);

      await device.triggerCapabilityListener(capability, true);
      await device.triggerCapabilityListener(capability, false);

      assert.deepEqual(onOffCommands(sent), [[channel, CMD_ON], [channel, CMD_OFF]]);
    });

    test(`${driver}: channel ${channel} switched at the wall shows in Homey`, async () => {
      const { device, node } = await startSwitch(driver);

      await deliverAttributeReport(node, {
        endpointId: channel, clusterId: ON_OFF, attributeId: ON_OFF_ATTRIBUTE, dataTypeId: BOOL, value: Buffer.from([1]),
      });
      await flushAsync();

      assert.equal(device.getCapabilityValue(capability), true);
    });
  }
}
