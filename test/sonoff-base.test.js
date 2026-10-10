'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode } = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');

const SonoffBase = require('../drivers/sonoffbase');

const BASIC = 0x0000;
const POWER_CONFIGURATION = 0x0001;
const ON_OFF = 0x0006;
const CMD_READ_ATTRIBUTES = 0x00;
// Power configuration: batteryPercentageRemaining 0x0021 (uint8, 0.5 % units, 0xFF = unknown)
const BATTERY_PERCENTAGE_REMAINING = 0x0021;
const UINT8 = 0x20;

class Device extends SonoffBase {}

function batteryDevice({ battery, capabilities = { measure_battery: 50 } } = {}) {
  const attributeValues = battery === undefined ? {}
    : { 1: { [POWER_CONFIGURATION]: { [BATTERY_PERCENTAGE_REMAINING]: Buffer.from([UINT8, battery]) } } };
  const { zclNode, node, sent } = createZigbeeNode({ endpoints: { 1: [BASIC, POWER_CONFIGURATION, ON_OFF] }, attributeValues });
  const { device, recorded } = createDevice(Device, { zclNode, capabilities });
  return { device, recorded, zclNode, node, sent };
}

test('a battery level of 200 (0.5 % units) is shown as 100 %', async () => {
  const { device } = batteryDevice({ battery: 200 });

  await device.checkBattery();

  assert.equal(device.getCapabilityValue('measure_battery'), 100);
});

test('an unknown battery level (0xFF) is not shown as 127.5 %', async () => {
  const { device } = batteryDevice({ battery: 0xFF });

  await device.checkBattery();

  assert.equal(device.getCapabilityValue('measure_battery'), 50);
});

// ZBMINIL/ZBMINIL2 are mains powered but list the power configuration cluster
test('a mains powered device without a battery is not asked for one', async () => {
  const { device, recorded, sent } = batteryDevice({ capabilities: { onoff: false } });

  await device.checkBattery();

  assert.deepEqual(sent.filter(s => s.clusterId === POWER_CONFIGURATION && s.frame.cmdId === CMD_READ_ATTRIBUTES), []);
  assert.deepEqual(recorded.errors, []);
});

test('the frame wrapper hands Homey the result of the frame handling', async () => {
  const { device, zclNode, node } = batteryDevice();
  device.node = node;
  device.printNode = () => {};
  await device.onNodeInit({ zclNode });

  // A frame for an endpoint the node does not have is handled without error
  const handled = node.handleFrame(9, ON_OFF, Buffer.from([0x18, 0x01, 0x0A, 0x00, 0x00, 0x10, 0x01]), {});

  assert.ok(handled instanceof Promise, 'the promise of the frame handling is returned');
  await handled;
});

test('deleting a device removes the listeners it registered', async () => {
  const { device, zclNode } = batteryDevice();
  zclNode.endpoints[1].clusters.onOff.on('attr.onOff', () => {});

  await device.onDeleted();
  await flushAsync();

  assert.equal(zclNode.endpoints[1].clusters.onOff.listenerCount('attr.onOff'), 0);
});
