'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { deliverAttributeReport } = require('./helpers/zigbee');
const { flushAsync } = require('./helpers/device');
const { startDevice } = require('./helpers/start');

const TEMPERATURE = 0x0402;
const HUMIDITY = 0x0405;
const MEASURED_VALUE = 0x0000;
const INT16 = 0x29;
const UINT16 = 0x21;

const SETTINGS = { temperature_offset: 0, temperature_decimals: '1', humidity_offset: 0, humidity_decimals: '1' };

function report(node, clusterId, value) {
  const bytes = Buffer.alloc(2);
  if (clusterId === TEMPERATURE) bytes.writeInt16LE(value);
  else bytes.writeUInt16LE(value);
  return deliverAttributeReport(node, {
    endpointId: 1, clusterId, attributeId: MEASURED_VALUE, dataTypeId: clusterId === TEMPERATURE ? INT16 : UINT16, value: bytes,
  });
}

// StyraHem issue #87: offsets seemed not to work, because they only applied to the next measurement,
// which a sensor reporting on a change of 1 °C or hourly may send much later
for (const driver of ['SNZB-02P', 'SNZB-02D', 'SNZB-02']) {
  test(`${driver}: a changed temperature offset shows at once`, async () => {
    const { device, node } = await startDevice(driver, { settings: SETTINGS });
    await report(node, TEMPERATURE, 2150);
    await flushAsync();
    assert.equal(device.getCapabilityValue('measure_temperature'), 21.5);

    await device.onSettings({
      oldSettings: SETTINGS, newSettings: { ...SETTINGS, temperature_offset: -1 }, changedKeys: ['temperature_offset'],
    });

    assert.equal(device.getCapabilityValue('measure_temperature'), 20.5);
  });

  test(`${driver}: a changed humidity offset and number of decimals show at once`, async () => {
    const { device, node } = await startDevice(driver, { settings: SETTINGS });
    await report(node, HUMIDITY, 4567);
    await flushAsync();
    assert.equal(device.getCapabilityValue('measure_humidity'), 45.7);

    await device.onSettings({
      oldSettings: SETTINGS,
      newSettings: { ...SETTINGS, humidity_offset: 2, humidity_decimals: '2' },
      changedKeys: ['humidity_offset', 'humidity_decimals'],
    });

    assert.equal(device.getCapabilityValue('measure_humidity'), 47.67);
  });
}

test('SNZB-02LD: a changed temperature offset shows at once', async () => {
  const settings = { temperature_offset: 0, temperature_decimals: '1' };
  const { device, node } = await startDevice('SNZB-02LD', { settings });
  await report(node, TEMPERATURE, -1830);
  await flushAsync();
  assert.equal(device.getCapabilityValue('measure_temperature'), -18.3);

  await device.onSettings({ oldSettings: settings, newSettings: { ...settings, temperature_offset: 0.5 }, changedKeys: ['temperature_offset'] });

  assert.equal(device.getCapabilityValue('measure_temperature'), -17.8);
});

test('an offset changed before the first measurement shows with that measurement', async () => {
  const { device, node } = await startDevice('SNZB-02P', { settings: SETTINGS });

  await device.onSettings({
    oldSettings: SETTINGS, newSettings: { ...SETTINGS, temperature_offset: 1 }, changedKeys: ['temperature_offset'],
  });
  assert.equal(device.getCapabilityValue('measure_temperature'), null);

  // Homey stores the new settings once onSettings succeeded
  device.__fake.settings.temperature_offset = 1;
  await report(node, TEMPERATURE, 2000);
  await flushAsync();
  assert.equal(device.getCapabilityValue('measure_temperature'), 21);
});

test('the shown value keeps the chosen number of decimals, also with a finer offset', () => {
  const { shownMeasurement } = require('../lib/shownMeasurement');

  // 21.50 °C with an offset of 0.25 at one decimal: 21.8, not 21.75
  assert.equal(shownMeasurement(2150, 0.25, '1'), 21.8);
  assert.equal(shownMeasurement(2150, 0.25, '2'), 21.75);
  assert.equal(shownMeasurement(-1830, 0.5, '1'), -17.8);
});
