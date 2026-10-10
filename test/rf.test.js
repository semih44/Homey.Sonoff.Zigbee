'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { RFUtil } = require('homey-rfdriver');
const { createDevice, flushAsync } = require('./helpers/device');

const RfSignal = require('../lib/RfSignal');
const RfDevice = require('../drivers/RF/device.js');
const RfDriver = require('../drivers/RF/driver.js');

// homey-rfdriver (RFDriver.onPairRFReceiverLearn): a receiver added from Homey learns the pair
// command, and the new device keeps commandToDeviceData(pairCommand) as its data
function pairReceiver() {
  const command = RfSignal.createPairCommand();
  return { command, data: RfSignal.commandToDeviceData(command) };
}

// A trigger card whose trigger() stays pending until resolved by the test
function pendingTrigger() {
  const calls = [];
  let resolve;
  return {
    calls,
    resolve: () => resolve(),
    card: {
      trigger: (...args) => {
        calls.push(args);
        return new Promise(r => { resolve = r; });
      },
    },
  };
}

test('RF: a receiver added from Homey sends the code it learned when paired', t => {
  t.mock.method(Math, 'random', () => 0.5);
  const { command, data } = pairReceiver();

  // drivers/RF/device.js sends { code } from the device data when its button is pressed
  const sent = RfSignal.commandToPayload({ code: data.code });

  assert.deepEqual(sent, RfSignal.commandToPayload(command));
  assert.equal(sent.length, 24);
});

test('RF: a receiver added from Homey recognises its own code when it is received', async t => {
  t.mock.method(Math, 'random', () => 0.5);
  const { command, data } = pairReceiver();
  const { device } = createDevice(RfDevice, { data: { uuid: 'x', ...data, copiedFromRemote: false } });
  device.driver = { getRFSignal: async () => ({ constructor: RfSignal }) };

  const received = RfSignal.payloadToCommand(RfSignal.commandToPayload(command));

  assert.equal(await device.onCommandMatch(received), true);
});

test('RF: receivers added from Homey one after another get different codes', t => {
  const draws = [0.5, 0.501];
  t.mock.method(Math, 'random', () => draws.shift());

  const first = pairReceiver();
  const second = pairReceiver();

  assert.notDeepEqual(RfSignal.commandToPayload(first.command), RfSignal.commandToPayload(second.command));
});

test('RF: a remote learned from its signal keeps the received code', () => {
  const payload = RFUtil.numberToBitArray(0xA1B2C3, 24);

  const data = RfSignal.commandToDeviceData(RfSignal.payloadToCommand(payload));

  assert.deepEqual(data, { code: 'a1b2c3' });
  assert.deepEqual(RfSignal.commandToPayload({ code: data.code }), payload);
});

test('RF: pressing the button sends the code and reports a failed transmission', async () => {
  const { device } = createDevice(RfDevice, { data: { uuid: 'x', code: 'a1b2c3', copiedFromRemote: false } });
  const listeners = {};
  const sent = [];
  let failure = null;
  device.registerCapabilityListener = (capability, listener) => { listeners[capability] = listener; };
  device.homey = { flow: { getDeviceTriggerCard: () => pendingTrigger().card } };
  device.driver = {
    tx: async (command, options) => {
      sent.push([command, options]);
      if (failure) throw failure;
    },
  };
  await device.onRFInit();

  await listeners.button(true);
  assert.deepEqual(sent, [[{ code: 'a1b2c3' }, { device }]]);

  failure = new Error('RF transmission failed');
  await assert.rejects(listeners.button(true), /RF transmission failed/);
});

test('RF: a received code is only logged as triggered once the flow trigger ran', async () => {
  const trigger = pendingTrigger();
  const logs = [];
  const driver = Object.assign(Object.create(RfDriver.prototype), {
    _rfTrigger: trigger.card, log: message => logs.push(message), error() {},
  });

  await driver.receive({ bits: '1'.repeat(24), hex: 'ffffff' }, { isFirst: true });

  assert.deepEqual(trigger.calls, [[{ code: 'ffffff' }, { code: 'ffffff' }]]);
  assert.equal(logs.includes('Sent global trigger'), false);
  trigger.resolve();
  await flushAsync();
  assert.equal(logs.includes('Sent global trigger'), true);
});

test('RF: a device is only logged as triggered once its flow trigger ran', async () => {
  const trigger = pendingTrigger();
  const { device } = createDevice(RfDevice);
  const logs = [];
  device.log = message => logs.push(message);
  device._receiveTrigger = trigger.card;

  await device.onCommandFirst({ hex: 'ffffff' });

  assert.equal(trigger.calls.length, 1);
  assert.equal(logs.includes('Receive trigged'), false);
  trigger.resolve();
  await flushAsync();
  assert.equal(logs.includes('Receive trigged'), true);
});
