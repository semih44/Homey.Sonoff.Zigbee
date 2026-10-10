'use strict';

// Local time below is checked for Berlin; set before any date is created
process.env.TZ = 'Europe/Berlin';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { Cluster } = require('zigbee-clusters');
const { createZigbeeNode, writtenAttribute, CMD_WRITE_ATTRIBUTES } = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');
const { endpointsFromCompose } = require('./helpers/compose');

const SonoffBase = require('../drivers/sonoffbase');
const TRVZB = require('../drivers/TRVZB/device.js');

const THERMOSTAT = 0x0201;
const SONOFF = 0xFC11;
const TIME = 0x000A;
// Thermostat: localTemperatureCalibration 0x0010 (int8, 0.1 °C), occupiedHeatingSetpoint 0x0012 (int16, 0.01 °C)
const LOCAL_TEMPERATURE_CALIBRATION = 0x0010;
const OCCUPIED_HEATING_SETPOINT = 0x0012;
// eWeLink TRVZB (zigbee-herdsman-converters sonoff.ts): frost protection 0x6002 (int16, 0.01 °C),
// temperature sensor select 0x600E (uint8: 0 local, 1 remote, 2 remote source offline),
// smart temperature control 0x6017 (BITMAP8: 0x02 on, 0x00 off)
const FROST_PROTECTION = 0x6002;
const TEMPERATURE_SENSOR_SELECT = 0x600E;
const SMART_TEMPERATURE_CONTROL = 0x6017;
const INT8 = 0x28;
const INT16 = 0x29;
const UINT8 = 0x20;
const MAP8 = 0x18;
const INVALID_VALUE = 0x87;

function trvzb(options = {}) {
  const { zclNode, sent } = createZigbeeNode({ endpoints: endpointsFromCompose('TRVZB'), ...options });
  const { device } = createDevice(TRVZB, { zclNode, capabilities: { onoff: true } });
  return { device, zclNode, sent };
}

function sonoffWrites(sent) {
  return sent.filter(s => s.clusterId === SONOFF && s.frame.cmdId === CMD_WRITE_ATTRIBUTES).map(writtenAttribute);
}

// Runs onNodeInit with the base class stubbed and returns the capability listeners it registered
async function initAndCaptureListeners(device, zclNode) {
  const listeners = {};
  device.registerCapability = () => {};
  device.registerCapabilityListener = (capability, listener) => { listeners[capability] = listener; };
  const originalBaseInit = SonoffBase.prototype.onNodeInit;
  SonoffBase.prototype.onNodeInit = async () => {};
  try {
    await device.onNodeInit({ zclNode });
  } finally {
    SonoffBase.prototype.onNodeInit = originalBaseInit;
  }
  return listeners;
}

test('TRVZB: a reported temperature calibration of -15 (0.1 °C) is shown as -1.5 °C', async () => {
  const { device } = trvzb({
    attributeValues: { 1: { [THERMOSTAT]: { [LOCAL_TEMPERATURE_CALIBRATION]: Buffer.from([INT8, 0xF1]) } } },
  });

  device.checkAttributes();
  await flushAsync();

  assert.equal(device.getSettings().localTemperatureCalibration, -1.5);
});

test('TRVZB: frost protection of 4.1 °C is written as 410', async () => {
  const { device, sent } = trvzb();

  await device.onSettings({
    oldSettings: {}, newSettings: { frost_protection_temperature: 4.1 }, changedKeys: ['frost_protection_temperature'],
  });

  const [write] = sonoffWrites(sent);
  assert.equal(write.attributeId, FROST_PROTECTION);
  assert.equal(write.dataTypeId, INT16);
  assert.deepEqual([...write.valueBytes.subarray(0, 2)], [0x9A, 0x01]);
});

test('TRVZB: smart temperature control is written as a bitmap with 0x02 for on', async () => {
  const { device, sent } = trvzb();

  await device.onSettings({
    oldSettings: {}, newSettings: { smart_temperature_control: true }, changedKeys: ['smart_temperature_control'],
  });

  const [write] = sonoffWrites(sent);
  assert.equal(write.attributeId, SMART_TEMPERATURE_CONTROL);
  assert.equal(write.dataTypeId, MAP8);
  assert.equal(write.valueBytes[0], 0x02);
});

test('TRVZB: a reported smart temperature control of 0x02 is shown as on', async () => {
  const { device } = trvzb({
    attributeValues: { 1: { [SONOFF]: { [SMART_TEMPERATURE_CONTROL]: Buffer.from([MAP8, 0x02]) } } },
  });

  device.checkAttributes();
  await flushAsync();

  assert.equal(device.getSettings().smart_temperature_control, true);
});

test('TRVZB: "remote source offline" (2) keeps the external sensor selected', async () => {
  const { device } = trvzb({
    attributeValues: { 1: { [SONOFF]: { [TEMPERATURE_SENSOR_SELECT]: Buffer.from([UINT8, 0x02]) } } },
  });

  device.checkAttributes();
  await flushAsync();

  assert.equal(device.getSettings().temperature_sensor_select, '1');
});

test('TRVZB: a target temperature of 21.5 °C is written as 2150 and completes on acknowledgement', async () => {
  const { device, zclNode, sent } = trvzb();
  const listeners = await initAndCaptureListeners(device, zclNode);

  await listeners.target_temperature(21.5);

  const writes = sent.filter(s => s.clusterId === THERMOSTAT && s.frame.cmdId === CMD_WRITE_ATTRIBUTES)
    .map(writtenAttribute);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].attributeId, OCCUPIED_HEATING_SETPOINT);
  assert.deepEqual([...writes[0].valueBytes.subarray(0, 2)], [0x66, 0x08]);
});

test('TRVZB: a target temperature the device rejects is reported to Homey', async () => {
  const { device, zclNode } = trvzb({
    rejectedWrites: { 1: { [THERMOSTAT]: { [OCCUPIED_HEATING_SETPOINT]: INVALID_VALUE } } },
  });
  const listeners = await initAndCaptureListeners(device, zclNode);

  await assert.rejects(listeners.target_temperature(21.5), error => error.message.includes('INVALID_VALUE'));
});

test('TRVZB: the time server answers with Unix time, as zigbee-herdsman-converters does for this valve', t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 0, 1) });
  const TimeServer = Cluster.getCluster(TIME);
  const server = new TimeServer({});

  assert.equal(server.time, 1767225600);
  // ZCL local time = UTC + time zone; Berlin is UTC+1 on 1 January
  assert.equal(server.local_time, 1767225600 + 3600);
});
