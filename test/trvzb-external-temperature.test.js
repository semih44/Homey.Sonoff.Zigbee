'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { writtenAttribute, CMD_WRITE_ATTRIBUTES } = require('./helpers/zigbee');
const { startDevice } = require('./helpers/start');

const SONOFF = 0xFC11;
// zigbee-herdsman-converters TRVZB external_temperature_input: 0x600D, int16 in 0.01 °C, 0 to 99.9 °C
const EXTERNAL_TEMPERATURE_INPUT = 0x600D;
const INT16 = 0x29;
const INVALID_VALUE = 0x87;
const LANGUAGES = ['en', 'nl', 'da', 'de', 'es', 'fr', 'it', 'no', 'sv', 'pl', 'ru', 'ko'];

// StyraHem issue #89: a flow card to hand the valve the temperature of another sensor
function card() {
  return require('../drivers/TRVZB/driver.flow.compose.json').actions.find(action => action.id === 'set_external_temperature');
}

async function runCard(device, temperature) {
  const listeners = {};
  const DriverClass = require('../drivers/TRVZB/driver.js');
  const driver = Object.assign(Object.create(DriverClass.prototype), {
    homey: { flow: { getActionCard: id => ({ registerRunListener: listener => { listeners[id] = listener; } }) } },
    log() {},
    error() {},
  });
  await driver.onInit();
  return listeners.set_external_temperature({ device, temperature }, {});
}

test('TRVZB: the card takes a temperature from 0 to 99.9 °C in 0.1 steps, in all languages', () => {
  const arg = card().args.find(a => a.name === 'temperature');

  assert.deepEqual([arg.type, arg.min, arg.max, arg.step], ['number', 0, 99.9, 0.1]);
  for (const text of [card().title, card().titleFormatted, card().hint, arg.placeholder]) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort());
  }
});

test('TRVZB: the card writes the temperature in 0.01 °C and shows it in the settings', async () => {
  const { device, sent } = await startDevice('TRVZB');
  sent.length = 0;

  await runCard(device, 21.5);

  const writes = sent.filter(s => s.clusterId === SONOFF && s.frame.cmdId === CMD_WRITE_ATTRIBUTES).map(writtenAttribute);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].attributeId, EXTERNAL_TEMPERATURE_INPUT);
  assert.equal(writes[0].dataTypeId, INT16);
  assert.equal(writes[0].valueBytes.readInt16LE(0), 2150);
  assert.equal(device.getSettings().external_temperature_input, 21.5);
});

test('TRVZB: a temperature outside 0 to 99.9 °C is refused instead of being sent', async () => {
  const { device, sent } = await startDevice('TRVZB');
  sent.length = 0;

  await assert.rejects(runCard(device, -2), { message: 'The external temperature must be between 0 and 99.9 °C' });
  await assert.rejects(runCard(device, 120), { message: 'The external temperature must be between 0 and 99.9 °C' });
  assert.deepEqual(sent.filter(s => s.frame.cmdId === CMD_WRITE_ATTRIBUTES), []);
});

test('TRVZB: a temperature the valve refuses fails the flow card', async () => {
  const { device } = await startDevice('TRVZB', {
    rejectedWrites: { 1: { [SONOFF]: { [EXTERNAL_TEMPERATURE_INPUT]: INVALID_VALUE } } },
  });

  await assert.rejects(runCard(device, 21.5), error => error.message.includes('INVALID_VALUE'));
});
