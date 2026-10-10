'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode, deliverAttributeReport } = require('./helpers/zigbee');
const { createDevice, flushAsync, waitFor } = require('./helpers/device');
const { endpointsFromCompose } = require('./helpers/compose');

const SonoffBase = require('../drivers/sonoffbase');

const ON_OFF = 0x0006;
const METERING = 0x0702;
const ELECTRICAL_MEASUREMENT = 0x0B04;
// Electrical measurement: rmsVoltage 0x0505, rmsCurrent 0x0508 (uint16), activePower 0x050B (int16),
// AC voltage/current/power multiplier and divisor 0x0600-0x0605 (uint16)
const RMS_VOLTAGE = 0x0505;
const RMS_CURRENT = 0x0508;
const ACTIVE_POWER = 0x050B;
const AC_VOLTAGE_MULTIPLIER = 0x0600;
const AC_VOLTAGE_DIVISOR = 0x0601;
const AC_CURRENT_MULTIPLIER = 0x0602;
const AC_CURRENT_DIVISOR = 0x0603;
const AC_POWER_MULTIPLIER = 0x0604;
const AC_POWER_DIVISOR = 0x0605;
// Metering: currentSummationDelivered 0x0000 (uint48), multiplier 0x0301 and divisor 0x0302 (uint24)
const CURRENT_SUMMATION_DELIVERED = 0x0000;
const MULTIPLIER = 0x0301;
const DIVISOR = 0x0302;
const ON_OFF_ATTRIBUTE = 0x0000;
const BOOL = 0x10;
const UINT16 = 0x21;
const UINT24 = 0x22;
const UINT48 = 0x25;
const INT16 = 0x29;

function bytes(length, value, signed = false) {
  const buffer = Buffer.alloc(length);
  if (signed) buffer.writeIntLE(value, 0, length);
  else buffer.writeUIntLE(value, 0, length);
  return buffer;
}

// Multiplier/divisor pairs as a plug could report them, chosen to differ from the old fixed scaling
const REPORTED_FACTORS = {
  1: {
    [ELECTRICAL_MEASUREMENT]: {
      [AC_POWER_MULTIPLIER]: Buffer.concat([Buffer.from([UINT16]), bytes(2, 1)]),
      [AC_POWER_DIVISOR]: Buffer.concat([Buffer.from([UINT16]), bytes(2, 10)]),
      [AC_VOLTAGE_MULTIPLIER]: Buffer.concat([Buffer.from([UINT16]), bytes(2, 1)]),
      [AC_VOLTAGE_DIVISOR]: Buffer.concat([Buffer.from([UINT16]), bytes(2, 10)]),
      [AC_CURRENT_MULTIPLIER]: Buffer.concat([Buffer.from([UINT16]), bytes(2, 1)]),
      [AC_CURRENT_DIVISOR]: Buffer.concat([Buffer.from([UINT16]), bytes(2, 100)]),
    },
    [METERING]: {
      [MULTIPLIER]: Buffer.concat([Buffer.from([UINT24]), bytes(3, 1)]),
      [DIVISOR]: Buffer.concat([Buffer.from([UINT24]), bytes(3, 100)]),
    },
  },
};

const MEASUREMENTS = {
  measure_power: { clusterId: ELECTRICAL_MEASUREMENT, attributeId: ACTIVE_POWER, dataTypeId: INT16, size: 2, signed: true },
  measure_voltage: { clusterId: ELECTRICAL_MEASUREMENT, attributeId: RMS_VOLTAGE, dataTypeId: UINT16, size: 2 },
  measure_current: { clusterId: ELECTRICAL_MEASUREMENT, attributeId: RMS_CURRENT, dataTypeId: UINT16, size: 2 },
  meter_power: { clusterId: METERING, attributeId: CURRENT_SUMMATION_DELIVERED, dataTypeId: UINT48, size: 6 },
};

function report(node, capability, value) {
  const { clusterId, attributeId, dataTypeId, size, signed } = MEASUREMENTS[capability];
  return deliverAttributeReport(node, {
    endpointId: 1, clusterId, attributeId, dataTypeId, value: bytes(size, value, signed),
  });
}

function reportOnOff(node, on) {
  return deliverAttributeReport(node, {
    endpointId: 1, clusterId: ON_OFF, attributeId: ON_OFF_ATTRIBUTE, dataTypeId: BOOL, value: Buffer.from([on ? 1 : 0]),
  });
}

// A paired plug that is switched on; its earlier values keep homey-zigbeedriver from reading them on start
function plug(driver, { attributeValues = {}, store = {}, failSend = false } = {}) {
  const DeviceClass = require(`../drivers/${driver}/device.js`);
  const { zclNode, node, sent } = createZigbeeNode({ endpoints: endpointsFromCompose(driver), attributeValues, failSend });
  const { device, recorded } = createDevice(DeviceClass, {
    zclNode,
    node,
    store,
    capabilities: { onoff: true, measure_power: 0, measure_voltage: 0, measure_current: 0, meter_power: 0 },
  });
  return { device, recorded, zclNode, node, sent };
}

// Runs onNodeInit with the real capability registration of homey-zigbeedriver and the base class stubbed
async function init(device, zclNode) {
  const originalBaseInit = SonoffBase.prototype.onNodeInit;
  SonoffBase.prototype.onNodeInit = async () => {};
  try {
    await device.onNodeInit({ zclNode });
  } finally {
    SonoffBase.prototype.onNodeInit = originalBaseInit;
  }
  await flushAsync();
}

for (const driver of ['S60ZBTPF', 'S60ZBTPG']) {
  // ZHA scales the standard clusters with the multiplier and divisor the plug reports;
  // zigbee-herdsman-converters reads them for the metering cluster as well
  for (const [capability, raw, shown] of [
    ['measure_power', 1234, 123.4],
    ['measure_voltage', 2305, 230.5],
    ['measure_current', 250, 2.5],
    ['meter_power', 12345, 123.45],
  ]) {
    test(`${driver}: ${capability} is scaled with the multiplier and divisor the plug reports`, async () => {
      const { device, zclNode, node } = plug(driver, { attributeValues: REPORTED_FACTORS });
      await init(device, zclNode);

      await report(node, capability, raw);
      await flushAsync();

      assert.equal(device.getCapabilityValue(capability), shown);
    });
  }

  test(`${driver}: the shown energy is read again once the plug's scaling is known`, async () => {
    const attributeValues = {
      1: {
        ...REPORTED_FACTORS[1],
        [METERING]: {
          ...REPORTED_FACTORS[1][METERING],
          [CURRENT_SUMMATION_DELIVERED]: Buffer.concat([Buffer.from([UINT48]), bytes(6, 12345)]),
        },
      },
    };
    const { device, zclNode } = plug(driver, { attributeValues });

    await init(device, zclNode);
    await waitFor(() => device.getCapabilityValue('meter_power') !== 0, { label: 'energy read again' });

    assert.equal(device.getCapabilityValue('meter_power'), 123.45);
  });

  test(`${driver}: without a reported multiplier and divisor the earlier scaling stays`, async () => {
    const { device, zclNode, node } = plug(driver);
    await init(device, zclNode);

    await report(node, 'measure_power', 50);
    await report(node, 'measure_voltage', 230);
    await report(node, 'measure_current', 250);
    await report(node, 'meter_power', 12345);
    await flushAsync();

    assert.equal(device.getCapabilityValue('measure_power'), 50);
    assert.equal(device.getCapabilityValue('measure_voltage'), 230);
    assert.equal(device.getCapabilityValue('measure_current'), 0.25);
    assert.equal(device.getCapabilityValue('meter_power'), 12.345);
  });

  test(`${driver}: factors read once are used when the plug cannot be read on a later start`, async () => {
    const first = plug(driver, { attributeValues: REPORTED_FACTORS });
    await init(first.device, first.zclNode);
    await waitFor(() => first.device.getStoreValue('measurementFactors') !== undefined, { label: 'factors stored' });

    const { device, zclNode, node } = plug(driver, { store: { measurementFactors: first.device.getStoreValue('measurementFactors') }, failSend: true });
    await init(device, zclNode);
    await report(node, 'measure_current', 250);
    await flushAsync();

    assert.equal(device.getCapabilityValue('measure_current'), 2.5);
  });

  // Firmware before 2.0.3 keeps reporting power and current after being switched off;
  // zigbee-herdsman-converters and ZHA show 0 then
  test(`${driver}: switching off shows no power and no current`, async () => {
    const { device, zclNode, node } = plug(driver);
    await init(device, zclNode);
    await report(node, 'measure_power', 1500);
    await report(node, 'measure_current', 6500);
    await flushAsync();

    await reportOnOff(node, false);
    await flushAsync();

    assert.equal(device.getCapabilityValue('measure_power'), 0);
    assert.equal(device.getCapabilityValue('measure_current'), 0);
  });

  test(`${driver}: power and current reported while off are shown as 0`, async () => {
    const { device, zclNode, node } = plug(driver);
    await init(device, zclNode);
    await reportOnOff(node, false);
    await flushAsync();

    await report(node, 'measure_power', 1500);
    await report(node, 'measure_current', 6500);
    await flushAsync();

    assert.equal(device.getCapabilityValue('measure_power'), 0);
    assert.equal(device.getCapabilityValue('measure_current'), 0);
  });
}
