'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const {
  deliverAttributeReport, configuredReporting, writtenAttribute, CMD_WRITE_ATTRIBUTES,
} = require('./helpers/zigbee');
const { flushAsync } = require('./helpers/device');
const { startDevice } = require('./helpers/start');
const { matchingDrivers } = require('./helpers/compose');

const SONOFF = 0xFC11;
// zigbee-herdsman-converters MINI-ZB1GP (eWeLink cluster): acCurrentCurrentValue 0x7004 (mA),
// acCurrentVoltageValue 0x7005 (mV), acCurrentPowerValue 0x7006 (signed mW in a uint32),
// totalEnergyConsumption 0x701E and totalOutputEnergyConsumption 0x701F (Wh); networkLed 0x0001,
// radioPower 0x0012 (turbo: 0x14 on, 0x09 off)
const AC_CURRENT = 0x7004;
const AC_VOLTAGE = 0x7005;
const AC_POWER = 0x7006;
const TOTAL_ENERGY = 0x701E;
const TOTAL_OUTPUT_ENERGY = 0x701F;
const NETWORK_LED = 0x0001;
const RADIO_POWER = 0x0012;
const UINT32 = 0x23;
const BOOL = 0x10;
const INT16 = 0x29;

function report(node, attributeId, value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value >>> 0);
  return deliverAttributeReport(node, { endpointId: 1, clusterId: SONOFF, attributeId, dataTypeId: UINT32, value: bytes });
}

// Requested in StyraHem issues #78, #85 and #86
test('MINI-ZB1GP: a SONOFF "MINI-ZB1GP" pairs with its own driver', () => {
  assert.deepEqual(matchingDrivers('SONOFF', 'MINI-ZB1GP'), ['MINI-ZB1GP']);
});

test('MINI-ZB1GP: Homey Energy counts imported and exported energy separately', () => {
  const manifest = require('../drivers/MINI-ZB1GP/driver.compose.json');

  assert.deepEqual(manifest.energy, { meterPowerImportedCapability: 'meter_power', meterPowerExportedCapability: 'meter_power.exported' });
  // zigbee-herdsman-converters binds genOnOff and the eWeLink cluster
  assert.ok(manifest.zigbee.endpoints['1'].bindings.includes(SONOFF));
});

test('MINI-ZB1GP: power is shown in watts, negative while energy flows back', async () => {
  const { device, node } = await startDevice('MINI-ZB1GP');

  await report(node, AC_POWER, 75500);
  await flushAsync();
  assert.equal(device.getCapabilityValue('measure_power'), 75.5);

  await report(node, AC_POWER, -1500);
  await flushAsync();
  assert.equal(device.getCapabilityValue('measure_power'), -1.5);
});

test('MINI-ZB1GP: current, voltage and the energy counters are shown in A, V and kWh', async () => {
  const { device, node } = await startDevice('MINI-ZB1GP');

  await report(node, AC_CURRENT, 1234);
  await report(node, AC_VOLTAGE, 230500);
  await report(node, TOTAL_ENERGY, 12345);
  await report(node, TOTAL_OUTPUT_ENERGY, 678);
  await flushAsync();

  assert.equal(device.getCapabilityValue('measure_current'), 1.234);
  assert.equal(device.getCapabilityValue('measure_voltage'), 230.5);
  assert.equal(device.getCapabilityValue('meter_power'), 12.345);
  assert.equal(device.getCapabilityValue('meter_power.exported'), 0.678);
});

// The meter sends 0xFFFFFFFF when it has no reading (gpmachado, homey.gpm.sonoff)
test('MINI-ZB1GP: "no reading" values are not shown', async () => {
  const { device, node } = await startDevice('MINI-ZB1GP', {
    capabilities: { measure_power: 10, measure_current: 1, measure_voltage: 230, meter_power: 5, 'meter_power.exported': 0 },
  });

  for (const attributeId of [AC_POWER, AC_CURRENT, AC_VOLTAGE, TOTAL_ENERGY]) await report(node, attributeId, 0xFFFFFFFF);
  await flushAsync();

  assert.deepEqual(
    ['measure_power', 'measure_current', 'measure_voltage', 'meter_power'].map(id => device.getCapabilityValue(id)),
    [10, 1, 230, 5],
  );
});

// Reporting of voltage and current as checked on two meters by gpmachado; the counters every 1-2 minutes
test('MINI-ZB1GP: voltage, current and the counters report on their own', async () => {
  const { sent } = await startDevice('MINI-ZB1GP', { firstInit: true });

  const configured = configuredReporting(sent.filter(frame => frame.clusterId === SONOFF))
    .map(({ attributeId, minInterval, maxInterval, minChange }) => [attributeId, minInterval, maxInterval, minChange])
    .sort((a, b) => a[0] - b[0]);
  assert.deepEqual(configured, [
    [AC_CURRENT, 10, 300, 100],
    [AC_VOLTAGE, 60, 300, 2000],
    [TOTAL_ENERGY, 60, 120, 1],
    [TOTAL_OUTPUT_ENERGY, 60, 120, 1],
  ]);
});

test('MINI-ZB1GP: the network LED and turbo mode are written to the eWeLink cluster', async () => {
  const { device, sent } = await startDevice('MINI-ZB1GP');
  sent.length = 0;

  // One change each: writtenAttribute decodes the first record of a write
  await device.onSettings({ oldSettings: {}, newSettings: { network_led: false }, changedKeys: ['network_led'] });
  await device.onSettings({ oldSettings: {}, newSettings: { turbo_mode: true }, changedKeys: ['turbo_mode'] });

  const writes = sent.filter(s => s.clusterId === SONOFF && s.frame.cmdId === CMD_WRITE_ATTRIBUTES).map(writtenAttribute)
    .map(({ attributeId, dataTypeId, valueBytes }) => [attributeId, dataTypeId, dataTypeId === INT16 ? valueBytes.readInt16LE(0) : valueBytes[0]])
    .sort((a, b) => a[0] - b[0]);
  assert.deepEqual(writes, [[NETWORK_LED, BOOL, 0], [RADIO_POWER, INT16, 0x14]]);
});
