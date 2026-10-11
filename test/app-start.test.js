'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const inspector = require('inspector');

require('./helpers/homey-stub');
const { createZigbeeNode } = require('./helpers/zigbee');
const { createDevice } = require('./helpers/device');

const SonoffBase = require('../drivers/sonoffbase');

test('the app opens no debugger port, whatever DEBUG is set to', t => {
  const open = t.mock.method(inspector, 'open', () => {});
  t.mock.method(inspector, 'waitForDebugger', () => {});
  const previous = process.env.DEBUG;
  process.env.DEBUG = '1X';
  try {
    delete require.cache[require.resolve('../app')];
    require('../app');
  } finally {
    if (previous === undefined) delete process.env.DEBUG;
    else process.env.DEBUG = previous;
  }

  assert.equal(open.mock.callCount(), 0);
});

test('a device start does not dump the whole node into the log unless debugging', async t => {
  class Device extends SonoffBase {}
  const { zclNode, node } = createZigbeeNode({ endpoints: { 1: [0x0000, 0x0006] } });
  const { device } = createDevice(Device, { zclNode, node });
  const printNode = t.mock.method(device, 'printNode', () => {});

  await device.onNodeInit({ zclNode });

  assert.equal(printNode.mock.callCount(), 0);
});
