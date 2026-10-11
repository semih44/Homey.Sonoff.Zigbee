'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const {
  deliverAttributeReport, configuredReporting, writtenAttribute, CMD_WRITE_ATTRIBUTES,
} = require('./helpers/zigbee');
const { flushAsync } = require('./helpers/device');
const { startDevice } = require('./helpers/start');
const { matchingDrivers, capabilitiesFromCompose } = require('./helpers/compose');

const ON_OFF = 0x0006;
const SONOFF = 0xFC11;
const CMD_PROTOCOL_DATA = 0x01;
// zigbee-herdsman-converters MINI-ZB1GSP (eWeLink cluster): networkLed 0x0001, radioPower 0x0012 (turbo:
// 0x14 on, 0x09 off), delayedPowerOnState 0x0014, delayedPowerOnTime 0x0015 (0.5 s units),
// externalTriggerMode 0x0016 (edge 0, pulse 1, following(off) 2, following(on) 130), detachRelayMode2
// 0x0019 (bit 0), detachRelayActionEvent 0x0028, acCurrentCurrentValue 0x7004 (mA), acCurrentVoltageValue
// 0x7005 (mV), acCurrentPowerValue 0x7006 (signed mW in a uint32), totalEnergyConsumption 0x701E and
// totalOutputEnergyConsumption 0x701F (Wh)
const ON_OFF_ATTRIBUTE = 0x0000;
const START_UP_ON_OFF = 0x4003;
const NETWORK_LED = 0x0001;
const RADIO_POWER = 0x0012;
const DELAYED_POWER_ON_STATE = 0x0014;
const DELAYED_POWER_ON_TIME = 0x0015;
const EXTERNAL_TRIGGER_MODE = 0x0016;
const DETACH_RELAY_MODE2 = 0x0019;
const DETACH_RELAY_ACTION_EVENT = 0x0028;
const AC_CURRENT = 0x7004;
const AC_VOLTAGE = 0x7005;
const AC_POWER = 0x7006;
const TOTAL_ENERGY = 0x701E;
const TOTAL_OUTPUT_ENERGY = 0x701F;
const BOOL = 0x10;
const MAP8 = 0x18;
const UINT8 = 0x20;
const UINT16 = 0x21;
const UINT32 = 0x23;
const INT16 = 0x29;
const ENUM8 = 0x30;

function report(node, attributeId, value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value >>> 0);
  return deliverAttributeReport(node, { endpointId: 1, clusterId: SONOFF, attributeId, dataTypeId: UINT32, value: bytes });
}

function reportOnOff(node, on) {
  return deliverAttributeReport(node, {
    endpointId: 1, clusterId: ON_OFF, attributeId: ON_OFF_ATTRIBUTE, dataTypeId: BOOL, value: Buffer.from([on ? 1 : 0]),
  });
}

// The capabilities of the driver with the relay on
function switchedOn() {
  return { ...capabilitiesFromCompose('MINI-ZB1GSP'), onoff: true };
}

function value({ dataTypeId, valueBytes }) {
  if (dataTypeId === INT16) return valueBytes.readInt16LE(0);
  if (dataTypeId === UINT16) return valueBytes.readUInt16LE(0);
  return valueBytes[0];
}

// Requested in StyraHem issue #78
test('MINI-ZB1GSP: a SONOFF "MINI-ZB1GSP" pairs with its own driver', () => {
  assert.deepEqual(matchingDrivers('SONOFF', 'MINI-ZB1GSP'), ['MINI-ZB1GSP']);
});

test('MINI-ZB1GSP: a switch whose imported and exported energy Homey Energy counts', () => {
  const manifest = require('../drivers/MINI-ZB1GSP/driver.compose.json');

  assert.equal(manifest.class, 'socket');
  assert.deepEqual([...manifest.capabilities].sort(), [
    'measure_current', 'measure_power', 'measure_voltage', 'meter_power', 'meter_power.exported', 'onoff',
  ]);
  assert.deepEqual(manifest.energy, { meterPowerImportedCapability: 'meter_power', meterPowerExportedCapability: 'meter_power.exported' });
  // zigbee-herdsman-converters binds genOnOff and the eWeLink cluster
  for (const cluster of [ON_OFF, SONOFF]) assert.ok(manifest.zigbee.endpoints['1'].bindings.includes(cluster), `binding ${cluster}`);
});

test('MINI-ZB1GSP: the relay follows its reports', async () => {
  const { device, node } = await startDevice('MINI-ZB1GSP');

  await reportOnOff(node, true);
  await flushAsync();
  assert.equal(device.getCapabilityValue('onoff'), true);
  await reportOnOff(node, false);
  await flushAsync();
  assert.equal(device.getCapabilityValue('onoff'), false);
});

test('MINI-ZB1GSP: power, current, voltage and the energy counters are shown in W, A, V and kWh', async () => {
  const { device, node } = await startDevice('MINI-ZB1GSP', { capabilities: switchedOn() });

  await report(node, AC_POWER, 75500);
  await report(node, AC_CURRENT, 330);
  await report(node, AC_VOLTAGE, 230500);
  await report(node, TOTAL_ENERGY, 12345);
  await report(node, TOTAL_OUTPUT_ENERGY, 678);
  await flushAsync();

  assert.equal(device.getCapabilityValue('measure_power'), 75.5);
  assert.equal(device.getCapabilityValue('measure_current'), 0.33);
  assert.equal(device.getCapabilityValue('measure_voltage'), 230.5);
  assert.equal(device.getCapabilityValue('meter_power'), 12.345);
  assert.equal(device.getCapabilityValue('meter_power.exported'), 0.678);
});

// zigbee-herdsman-converters on_off_clear_electricity: the switch keeps reporting the last power after
// turning off (zigbee2mqtt issue 28470)
test('MINI-ZB1GSP: power and current read 0 once the relay is off', async () => {
  const { device, node } = await startDevice('MINI-ZB1GSP', { capabilities: switchedOn() });
  await report(node, AC_POWER, 75500);
  await report(node, AC_CURRENT, 330);
  await flushAsync();
  assert.deepEqual([device.getCapabilityValue('measure_power'), device.getCapabilityValue('measure_current')], [75.5, 0.33]);

  await reportOnOff(node, false);
  await flushAsync();
  assert.deepEqual([device.getCapabilityValue('measure_power'), device.getCapabilityValue('measure_current')], [0, 0]);

  await report(node, AC_POWER, 75500);
  await report(node, AC_CURRENT, 330);
  await flushAsync();
  assert.deepEqual([device.getCapabilityValue('measure_power'), device.getCapabilityValue('measure_current')], [0, 0]);
});

test('MINI-ZB1GSP: the relay, voltage, current and the counters report on their own', async () => {
  const { sent } = await startDevice('MINI-ZB1GSP', { firstInit: true });

  const configured = configuredReporting(sent)
    .map(({ clusterId, attributeId, minInterval, maxInterval, minChange }) => [clusterId, attributeId, minInterval, maxInterval, minChange === undefined ? null : minChange])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  assert.deepEqual(configured, [
    // zigbee-herdsman-converters m.onOff(): MIN to MAX (65000 s)
    [ON_OFF, ON_OFF_ATTRIBUTE, 0, 65000, null],
    [SONOFF, AC_CURRENT, 10, 300, 100],
    [SONOFF, AC_VOLTAGE, 60, 300, 2000],
    [SONOFF, TOTAL_ENERGY, 60, 120, 1],
    [SONOFF, TOTAL_OUTPUT_ENERGY, 60, 120, 1],
  ]);
});

test('MINI-ZB1GSP: the settings are written to the eWeLink cluster', async () => {
  const { device, sent } = await startDevice('MINI-ZB1GSP');
  sent.length = 0;

  // One change each: writtenAttribute decodes the first record of a write
  for (const newSettings of [
    { network_led: false },
    { turbo_mode: true },
    { power_on_delay_state: true },
    { power_on_delay_time: 2.5 },
    { switch_mode: '130' },
    { detach_relay: true },
  ]) {
    await device.onSettings({ oldSettings: {}, newSettings, changedKeys: Object.keys(newSettings) });
  }

  const writes = sent.filter(s => s.clusterId === SONOFF && s.frame.cmdId === CMD_WRITE_ATTRIBUTES).map(writtenAttribute)
    .map(write => [write.attributeId, write.dataTypeId, value(write)]);
  assert.deepEqual(writes, [
    [NETWORK_LED, BOOL, 0],
    [RADIO_POWER, INT16, 0x14],
    [DELAYED_POWER_ON_STATE, BOOL, 1],
    [DELAYED_POWER_ON_TIME, UINT16, 5],
    [EXTERNAL_TRIGGER_MODE, UINT8, 130],
    [DETACH_RELAY_MODE2, MAP8, 0x01],
  ]);
});

test('MINI-ZB1GSP: the power-on state is written to the On/Off cluster', async () => {
  const { device, sent } = await startDevice('MINI-ZB1GSP');
  sent.length = 0;

  await device.onSettings({ oldSettings: {}, newSettings: { power_on_behavior: 'last_state' }, changedKeys: ['power_on_behavior'] });

  const writes = sent.filter(s => s.clusterId === ON_OFF && s.frame.cmdId === CMD_WRITE_ATTRIBUTES).map(writtenAttribute);
  assert.deepEqual(writes.map(write => [write.attributeId, write.dataTypeId, value(write)]), [[START_UP_ON_OFF, ENUM8, 0xFF]]);
});

test('MINI-ZB1GSP: inching is sent as the eWeLink protocolData command', async () => {
  const { device, sent } = await startDevice('MINI-ZB1GSP');
  sent.length = 0;

  await device.onSettings({
    oldSettings: {},
    newSettings: { inching_enabled: true, inching_time: 5, inching_mode: 'on' },
    changedKeys: ['inching_enabled'],
  });

  const commands = sent.filter(s => s.clusterId === SONOFF && s.frame.frameControl.clusterSpecific);
  assert.deepEqual(commands.map(({ endpointId, frame }) => [endpointId, frame.cmdId, [...frame.data]]), [
    [1, CMD_PROTOCOL_DATA, [0x01, 0x17, 0x07, 0x80, 0x81, 0x00, 0x0A, 0x00, 0x00, 0x00, 0x1A]],
  ]);
});

test('MINI-ZB1GSP: the values of the switch are shown in the settings', async () => {
  const { device } = await startDevice('MINI-ZB1GSP', {
    attributeValues: {
      1: {
        [ON_OFF]: { [START_UP_ON_OFF]: Buffer.from([ENUM8, 0xFF]) },
        [SONOFF]: {
          [NETWORK_LED]: Buffer.from([BOOL, 0]),
          [RADIO_POWER]: Buffer.from([INT16, 0x14, 0x00]),
          [DELAYED_POWER_ON_STATE]: Buffer.from([BOOL, 1]),
          [DELAYED_POWER_ON_TIME]: Buffer.from([UINT16, 6, 0]),
          [EXTERNAL_TRIGGER_MODE]: Buffer.from([UINT8, 2]),
          [DETACH_RELAY_MODE2]: Buffer.from([MAP8, 0x01]),
        },
      },
    },
  });
  await flushAsync();

  const { power_on_behavior, network_led, turbo_mode, power_on_delay_state, power_on_delay_time, switch_mode, detach_relay } = device.getSettings();
  assert.deepEqual(
    { power_on_behavior, network_led, turbo_mode, power_on_delay_state, power_on_delay_time, switch_mode, detach_relay },
    {
      power_on_behavior: 'last_state', network_led: false, turbo_mode: true, power_on_delay_state: true, power_on_delay_time: 3, switch_mode: '2', detach_relay: true,
    },
  );
});

// zigbee-herdsman-converters detachRelayActionEvent: 1 single_click, 2 double_click, 3 long_press,
// 4 switch_on, 5 switch_off
test('MINI-ZB1GSP: the wall switch triggers its flow cards while the relay is detached', async () => {
  const { node, triggered } = await startDevice('MINI-ZB1GSP');

  for (const event of [1, 2, 3, 4, 5, 9]) {
    await deliverAttributeReport(node, {
      endpointId: 1, clusterId: SONOFF, attributeId: DETACH_RELAY_ACTION_EVENT, dataTypeId: UINT8, value: Buffer.from([event]),
    });
  }
  await flushAsync();

  assert.deepEqual(triggered.map(([id]) => id), [
    'MINI-ZB1GSP:detach_single_click',
    'MINI-ZB1GSP:detach_double_click',
    'MINI-ZB1GSP:detach_long_press',
    'MINI-ZB1GSP:detach_switch_on',
    'MINI-ZB1GSP:detach_switch_off',
  ]);
});

test('MINI-ZB1GSP: every detach card of the driver exists', () => {
  const ids = require('../drivers/MINI-ZB1GSP/driver.flow.compose.json').triggers.map(card => card.id);

  assert.deepEqual(ids, ['single_click', 'double_click', 'long_press', 'switch_on', 'switch_off'].map(event => `{{driverId}}:detach_${event}`));
});
