'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require('./helpers/homey-stub');
const { createZigbeeNode } = require('./helpers/zigbee');
const { createDevice } = require('./helpers/device');
const { endpointsFromCompose } = require('./helpers/compose');

const SonoffBase = require('../drivers/sonoffbase');
const APP = require('../app.json');

const SONOFF = 0xFC11;
const OCCUPANCY_SENSING = 0x0406;
const NETWORK_LED = 0x0001;
const OCCUPIED_TO_UNOCCUPIED_DELAY = 0x0020;
const INVALID_VALUE = 0x87;

// Homey's i18n: the user's locale with English as fallback, placeholders written as __name__
function homeyIn(language) {
  const read = locale => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${locale}.json`), 'utf8'));
  const lookup = (locale, key) => key.split('.').reduce((node, part) => (node ? node[part] : undefined), locale);
  return {
    i18n: { getLanguage: () => language },
    __: (key, tokens = {}) => Object.entries(tokens)
      .reduce((text, [name, value]) => text.split(`__${name}__`).join(value), lookup(read(language), key) || lookup(read('en'), key)),
  };
}

// A device as Homey starts it: with its driver manifest, the user's language and the base initialisation
async function startDevice(driverId, language, nodeOptions = {}) {
  const DeviceClass = require(`../drivers/${driverId}/device.js`);
  const { zclNode, node } = createZigbeeNode({ endpoints: endpointsFromCompose(driverId), ...nodeOptions });
  const { device } = createDevice(DeviceClass, { zclNode, node });
  device.homey = homeyIn(language);
  device.driver = { manifest: APP.drivers.find(driver => driver.id === driverId) };
  await SonoffBase.prototype.onNodeInit.call(device, { zclNode });
  return device;
}

const DELAY = { oldSettings: {}, newSettings: { occupied_to_unoccupied_delay: 120 }, changedKeys: ['occupied_to_unoccupied_delay'] };

test('a setting the device refuses is reported in the language of the user', async () => {
  const device = await startDevice('MINI-ZB2GS', 'de', {
    rejectedWrites: { 1: { [SONOFF]: { [NETWORK_LED]: INVALID_VALUE } } },
  });

  await assert.rejects(device.onSettings({
    oldSettings: {}, newSettings: { network_led: false }, changedKeys: ['network_led'],
  }), { message: 'Speichern nicht möglich: Netzwerk-LED – Das Gerät hat den Wert abgelehnt (0x0001: INVALID_VALUE)' });
});

test('a setting inside a group is named with its group', async () => {
  const device = await startDevice('SNZB-06P', 'en', {
    rejectedWrites: { 1: { [OCCUPANCY_SENSING]: { [OCCUPIED_TO_UNOCCUPIED_DELAY]: INVALID_VALUE } } },
  });

  await assert.rejects(device.onSettings(DELAY),
    { message: 'Could not save: Occupied › Delay – The device refused the value (0x0020: INVALID_VALUE)' });
});

test('a device that does not answer is reported as such', async () => {
  const device = await startDevice('SNZB-06P', 'en');
  // zigbee-clusters gives up waiting for the answer with this error
  device.writeAttributes = async () => { throw new Error('timeout'); };

  await assert.rejects(device.onSettings(DELAY), { message: 'Could not save: Occupied › Delay – The device did not respond' });
});

test('when several settings change together, all of them are named', async () => {
  const device = await startDevice('SNZB-06P', 'en');
  device.writeAttributes = async () => { throw new Error('timeout'); };

  await assert.rejects(device.onSettings({
    oldSettings: {},
    newSettings: { occupied_to_unoccupied_delay: 120, occupied_threshold: '3' },
    changedKeys: ['occupied_to_unoccupied_delay', 'occupied_threshold'],
  }), { message: 'Could not save: Occupied › Delay, Occupied › Sensitivity – The device did not respond' });
});

test('no driver wraps setting errors in English text of its own', () => {
  const english = fs.readdirSync(path.join(__dirname, '..', 'drivers'))
    .map(entry => path.join(__dirname, '..', 'drivers', entry, 'device.js'))
    .concat(path.join(__dirname, '..', 'drivers', 'sonoffbase.js'))
    .filter(file => fs.existsSync(file) && /new Error\(`Failed to (update|send)/.test(fs.readFileSync(file, 'utf8')))
    .map(file => path.relative(path.join(__dirname, '..'), file));
  assert.deepEqual(english, []);
});
