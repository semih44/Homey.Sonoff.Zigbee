'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const {
  deliverAttributeReport, deliverClusterCommand, writtenAttribute, CMD_WRITE_ATTRIBUTES,
} = require('./helpers/zigbee');
const { flushAsync } = require('./helpers/device');
const { startDevice } = require('./helpers/start');
const { matchingDrivers } = require('./helpers/compose');

const BASIC = 0x0000;
const ILLUMINANCE_MEASUREMENT = 0x0400;
const OCCUPANCY_SENSING = 0x0406;
const SONOFF = 0xFC11;
// zigbee-herdsman-converters SNZB-06P24: occupancy 0x0000 (bitmap8); pirOToUDelay 0x0010 (uint16, 15-65535 s);
// illuminance measuredValue 0x0000 (uint16, 10000 x log10(lx) + 1); eWeLink occupancyZoneEnable 0x2016
// (bitmap16), illuminationCompensationOffset 0x2018 (int16, -1000 to 1000 lx), radarSensitivitySetting
// 0x2021 (int8, -6 to 6) and the spatialLearning command 0x04
const OCCUPANCY = 0x0000;
const PIR_OCCUPIED_TO_UNOCCUPIED_DELAY = 0x0010;
const MEASURED_VALUE = 0x0000;
const OCCUPANCY_ZONE_ENABLE = 0x2016;
const ILLUMINATION_COMPENSATION_OFFSET = 0x2018;
const RADAR_SENSITIVITY = 0x2021;
const CMD_SPATIAL_LEARNING = 0x04;
const MAP8 = 0x18;
const MAP16 = 0x19;
const UINT16 = 0x21;
const INT8 = 0x28;
const INT16 = 0x29;
const ZONES = [1, 2, 3, 4, 5, 6, 7].map(zone => `occupancy_zone_${zone}`);

function writes(sent, clusterId) {
  return sent.filter(s => s.clusterId === clusterId && s.frame.cmdId === CMD_WRITE_ATTRIBUTES).map(writtenAttribute);
}

function allZones(enabled) {
  return Object.fromEntries(ZONES.map(zone => [zone, enabled]));
}

// StyraHem issues #76 and #81 ask for this sensor
test('SNZB-06P24: a SONOFF "SNZB-06P24" pairs with its own driver', () => {
  assert.deepEqual(matchingDrivers('SONOFF', 'SNZB-06P24'), ['SNZB-06P24']);
});

test('SNZB-06P24: presence, illuminance and spatial learning as a maintenance action', () => {
  const manifest = require('../drivers/SNZB-06P24/driver.compose.json');
  const endpoint = manifest.zigbee.endpoints['1'];

  for (const cluster of [BASIC, ILLUMINANCE_MEASUREMENT, OCCUPANCY_SENSING, SONOFF]) {
    assert.ok(endpoint.clusters.includes(cluster), `cluster ${cluster}`);
  }
  assert.deepEqual([...manifest.capabilities].sort(), ['alarm_motion', 'button.spatial_learning', 'measure_luminance']);
  assert.equal(manifest.capabilitiesOptions['button.spatial_learning'].maintenanceAction, true);
});

test('SNZB-06P24: motion follows the occupancy reports', async () => {
  const { device, node } = await startDevice('SNZB-06P24');
  const report = occupied => deliverAttributeReport(node, {
    endpointId: 1, clusterId: OCCUPANCY_SENSING, attributeId: OCCUPANCY, dataTypeId: MAP8, value: Buffer.from([occupied]),
  });

  await report(1);
  await flushAsync();
  assert.equal(device.getCapabilityValue('alarm_motion'), true);
  await report(0);
  await flushAsync();
  assert.equal(device.getCapabilityValue('alarm_motion'), false);
});

test('SNZB-06P24: the illuminance is shown in lux', async () => {
  const { device, node } = await startDevice('SNZB-06P24');

  // 10000 x log10(1000 lx) + 1
  await deliverAttributeReport(node, {
    endpointId: 1, clusterId: ILLUMINANCE_MEASUREMENT, attributeId: MEASURED_VALUE, dataTypeId: UINT16, value: Buffer.from([0x31, 0x75]),
  });
  await flushAsync();

  assert.equal(device.getCapabilityValue('measure_luminance'), 1000);
});

test('SNZB-06P24: the delay, illuminance calibration and radar sensitivity are written to the sensor', async () => {
  const { device, sent } = await startDevice('SNZB-06P24');
  sent.length = 0;

  // One change each: writtenAttribute decodes the first record of a write
  for (const newSettings of [{ occupied_to_unoccupied_delay: 45 }, { illuminance_calibration: -200 }, { radar_sensitivity: -3 }]) {
    await device.onSettings({ oldSettings: {}, newSettings, changedKeys: Object.keys(newSettings) });
  }

  const [delay] = writes(sent, OCCUPANCY_SENSING);
  assert.deepEqual([delay.attributeId, delay.dataTypeId, delay.valueBytes.readUInt16LE(0)], [PIR_OCCUPIED_TO_UNOCCUPIED_DELAY, UINT16, 45]);
  const [calibration, sensitivity] = writes(sent, SONOFF);
  assert.deepEqual([calibration.attributeId, calibration.dataTypeId, calibration.valueBytes.readInt16LE(0)], [ILLUMINATION_COMPENSATION_OFFSET, INT16, -200]);
  assert.deepEqual([sensitivity.attributeId, sensitivity.dataTypeId, sensitivity.valueBytes.readInt8(0)], [RADAR_SENSITIVITY, INT8, -3]);
});

// zigbee-herdsman-converters occupancyZoneEnable(8, 0.5, true): eight zones of 0.5 m, the first two
// shown as one, so zone 1 (0-1 m) is bits 0 and 1 and zone n (from 2) is bit n
test('SNZB-06P24: the detection zones are written as one bitmap', async () => {
  const { device, sent } = await startDevice('SNZB-06P24');
  sent.length = 0;

  await device.onSettings({ oldSettings: {}, newSettings: { ...allZones(true), occupancy_zone_1: false }, changedKeys: ['occupancy_zone_1'] });
  await device.onSettings({ oldSettings: {}, newSettings: { ...allZones(true), occupancy_zone_3: false }, changedKeys: ['occupancy_zone_3'] });

  assert.deepEqual(
    writes(sent, SONOFF).map(write => [write.attributeId, write.dataTypeId, write.valueBytes.readUInt16LE(0)]),
    [[OCCUPANCY_ZONE_ENABLE, MAP16, 0b11111100], [OCCUPANCY_ZONE_ENABLE, MAP16, 0b11110111]],
  );
});

test('SNZB-06P24: the values of the sensor are shown in the settings', async () => {
  const { device } = await startDevice('SNZB-06P24', {
    attributeValues: {
      1: {
        [OCCUPANCY_SENSING]: { [PIR_OCCUPIED_TO_UNOCCUPIED_DELAY]: Buffer.from([UINT16, 45, 0]) },
        [SONOFF]: {
          [ILLUMINATION_COMPENSATION_OFFSET]: Buffer.from([INT16, 150, 0]),
          [RADAR_SENSITIVITY]: Buffer.from([INT8, 0xFE]),
          [OCCUPANCY_ZONE_ENABLE]: Buffer.from([MAP16, 0b11110011, 0]),
        },
      },
    },
  });
  await flushAsync();

  const settings = device.getSettings();
  assert.deepEqual(
    [settings.occupied_to_unoccupied_delay, settings.illuminance_calibration, settings.radar_sensitivity],
    [45, 150, -2],
  );
  assert.deepEqual(ZONES.map(zone => settings[zone]), [true, false, false, true, true, true, true]);
});

// zigbee-herdsman-converters ignores an empty zone bitmap
test('SNZB-06P24: an empty zone bitmap leaves the zones as they are', async () => {
  const { device } = await startDevice('SNZB-06P24', {
    settings: allZones(true),
    attributeValues: { 1: { [SONOFF]: { [OCCUPANCY_ZONE_ENABLE]: Buffer.from([MAP16, 0, 0]) } } },
  });
  await flushAsync();

  assert.deepEqual(ZONES.map(zone => device.getSettings()[zone]), ZONES.map(() => true));
});

// zigbee-herdsman-converters spatialLearning: sub-command 0, then the time as uint64 in ms
test('SNZB-06P24: spatial learning starts with the eWeLink command 0x04', async () => {
  const { device, sent } = await startDevice('SNZB-06P24');
  sent.length = 0;

  const before = BigInt(Date.now());
  await device.triggerCapabilityListener('button.spatial_learning', true);
  const after = BigInt(Date.now());

  const commands = sent.filter(s => s.clusterId === SONOFF && s.frame.frameControl.clusterSpecific);
  assert.equal(commands.length, 1);
  const { endpointId, frame } = commands[0];
  assert.deepEqual([endpointId, frame.cmdId, frame.frameControl.manufacturerSpecific, frame.data.length, frame.data[0]], [1, CMD_SPATIAL_LEARNING, false, 9, 0x00]);
  const time = frame.data.readBigUInt64LE(1);
  assert.ok(time >= before && time <= after, `time ${time}`);
});

// The sensor answers with command 0x04: sub-command 1 when it starts, 2 with the result (state and
// reason 0 when it succeeded)
test('SNZB-06P24: the settings show how the spatial learning went', async () => {
  const { device, node } = await startDevice('SNZB-06P24');
  const answer = data => deliverClusterCommand(node, { endpointId: 1, clusterId: SONOFF, cmdId: CMD_SPATIAL_LEARNING, data: Buffer.from(data) });
  const sequence = Array(8).fill(0x11);

  await answer([0x01, ...sequence, ...Array(8).fill(0x22)]);
  await flushAsync();
  assert.equal(device.getSettings().spatial_learning_status, 'Learning');

  await answer([0x02, ...sequence, 0x00, 0x00]);
  await flushAsync();
  assert.equal(device.getSettings().spatial_learning_status, 'Completed');

  await answer([0x02, ...sequence, 0x01, 0x02]);
  await flushAsync();
  assert.equal(device.getSettings().spatial_learning_status, 'Failed');
});
