'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode, deliverClusterCommand } = require('./helpers/zigbee');
const { createDevice } = require('./helpers/device');
const { endpointsFromCompose } = require('./helpers/compose');

const SonoffBase = require('../drivers/sonoffbase');
const SNZB01KF = require('../drivers/SNZB-01-KF/device.js');

const IAS_ZONE = 0x0500;
// IAS zone statusChangeNotification: zone status (map16), extended status, zone id, delay (uint16)
const ZONE_STATUS_CHANGE_NOTIFICATION = 0x00;
const notification = zoneStatus => Buffer.from([zoneStatus, 0x00, 0x00, 0x01, 0x00, 0x00]);

// Runs onNodeInit with the base class stubbed; returns the node and the flow cards triggered
async function initButton() {
  const { zclNode, node } = createZigbeeNode({ endpoints: endpointsFromCompose('SNZB-01-KF') });
  const { device } = createDevice(SNZB01KF, { zclNode });
  const triggered = [];
  device.driver = { id: 'SNZB-01-KF' };
  device.homey = { flow: { getDeviceTriggerCard: id => ({ trigger: async () => { triggered.push(id); } }) } };

  const originalBaseInit = SonoffBase.prototype.onNodeInit;
  SonoffBase.prototype.onNodeInit = async () => {};
  try {
    await device.onNodeInit({ zclNode });
  } finally {
    SonoffBase.prototype.onNodeInit = originalBaseInit;
  }
  return { node, triggered };
}

// zigbee-herdsman-converters (SNZB-01-KF): presses arrive as IAS zone status changes,
// 1 = single press, 0 = off; the button offers no other action
test('SNZB-01-KF: a press reported as IAS zone status 1 triggers a single click', async () => {
  const { node, triggered } = await initButton();

  await deliverClusterCommand(node, {
    endpointId: 1, clusterId: IAS_ZONE, cmdId: ZONE_STATUS_CHANGE_NOTIFICATION, data: notification(0x01),
  });

  assert.deepEqual(triggered, ['SNZB-01-KF:single_click']);
});

test('SNZB-01-KF: the status returning to 0 triggers nothing', async () => {
  const { node, triggered } = await initButton();

  await deliverClusterCommand(node, {
    endpointId: 1, clusterId: IAS_ZONE, cmdId: ZONE_STATUS_CHANGE_NOTIFICATION, data: notification(0x00),
  });

  assert.deepEqual(triggered, []);
});

test('SNZB-01-KF: a hold (IAS zone status 3) is not taken for a single click', async () => {
  const { node, triggered } = await initButton();

  await deliverClusterCommand(node, {
    endpointId: 1, clusterId: IAS_ZONE, cmdId: ZONE_STATUS_CHANGE_NOTIFICATION, data: notification(0x03),
  });

  assert.deepEqual(triggered, []);
});

test('SNZB-01-KF: the IAS zone is bound, as zigbee-herdsman-converters configures it', () => {
  const manifest = require('../drivers/SNZB-01-KF/driver.compose.json');

  assert.equal(manifest.zigbee.endpoints['1'].clusters.includes(IAS_ZONE), true);
  assert.ok(manifest.zigbee.endpoints['1'].bindings.includes(IAS_ZONE));
});

test('SNZB-01-KF: only the single click it can send is offered as a flow card', () => {
  const flow = require('../drivers/SNZB-01-KF/driver.flow.compose.json');

  assert.deepEqual(flow.triggers.map(trigger => trigger.id), ['{{driverId}}:single_click']);
});
