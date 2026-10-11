'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode } = require('./helpers/zigbee');
const { createDevice } = require('./helpers/device');

const SonoffBase = require('../drivers/sonoffbase');

class Device extends SonoffBase {}

function deviceOfDriver(manifestClass, deviceClass) {
  const { zclNode, node } = createZigbeeNode({ endpoints: { 1: [0x0000, 0x0006] } });
  const { device, recorded } = createDevice(Device, { zclNode, node, deviceClass });
  device.driver = { manifest: { class: manifestClass } };
  return { device, recorded, zclNode };
}

test('the radiator valve is a thermostat and the 4-button remote a remote', () => {
  assert.equal(require('../drivers/TRVZB/driver.compose.json').class, 'thermostat');
  assert.equal(require('../drivers/SNZB-01M/driver.compose.json').class, 'remote');
});

// Homey applies the class of the driver only when pairing; ZBMINIL/L2/R2 went from light to socket
test('a device paired with an older class of its driver gets the current one on start', async () => {
  const { device, zclNode } = deviceOfDriver('socket', 'light');

  await device.onNodeInit({ zclNode });

  assert.equal(device.getClass(), 'socket');
});

test('a device that already has the class of its driver is left alone', async () => {
  const { device, recorded, zclNode } = deviceOfDriver('socket', 'socket');

  await device.onNodeInit({ zclNode });

  assert.deepEqual(recorded.classes, []);
});
