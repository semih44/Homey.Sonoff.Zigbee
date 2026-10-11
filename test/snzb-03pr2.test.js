'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { deliverAttributeReport, writtenAttribute, CMD_WRITE_ATTRIBUTES } = require('./helpers/zigbee');
const { flushAsync } = require('./helpers/device');
const { startDevice } = require('./helpers/start');
const { matchingDrivers } = require('./helpers/compose');

const BASIC = 0x0000;
const POWER_CONFIGURATION = 0x0001;
const ILLUMINANCE_MEASUREMENT = 0x0400;
const OCCUPANCY_SENSING = 0x0406;
const SONOFF = 0xFC11;
// zigbee-herdsman-converters SNZB-03PR2: occupancy 0x0000 (bitmap8); pirOccupiedToUnoccupiedDelay 0x0010
// (uint16, 5-60 s); illuminance measuredValue 0x0000 (uint16, 10000 x log10(lx) + 1); eWeLink
// illuminationCompensationOffset 0x2018 (int16, -1000 to 1000 lx)
const OCCUPANCY = 0x0000;
const PIR_OCCUPIED_TO_UNOCCUPIED_DELAY = 0x0010;
const MEASURED_VALUE = 0x0000;
const ILLUMINATION_COMPENSATION_OFFSET = 0x2018;
const MAP8 = 0x18;
const UINT16 = 0x21;
const INT16 = 0x29;

function writes(sent, clusterId) {
  return sent.filter(s => s.clusterId === clusterId && s.frame.cmdId === CMD_WRITE_ATTRIBUTES).map(writtenAttribute);
}

// StyraHem issue #82 asks for this sensor; its interview lists clusters 0, 1, 3, 32, 1024, 1030, 64529, 64599
test('SNZB-03PR2: a SONOFF "SNZB-03PR2" pairs with its own driver', () => {
  assert.deepEqual(matchingDrivers('SONOFF', 'SNZB-03PR2'), ['SNZB-03PR2']);
});

test('SNZB-03PR2: the manifest lists the clusters it uses from the interview and its CR2477 battery', () => {
  const manifest = require('../drivers/SNZB-03PR2/driver.compose.json');
  const endpoint = manifest.zigbee.endpoints['1'];

  for (const cluster of [BASIC, POWER_CONFIGURATION, ILLUMINANCE_MEASUREMENT, OCCUPANCY_SENSING, SONOFF]) {
    assert.ok(endpoint.clusters.includes(cluster), `cluster ${cluster}`);
  }
  assert.deepEqual([...manifest.capabilities].sort(), ['alarm_motion', 'measure_battery', 'measure_luminance']);
  assert.deepEqual(manifest.energy.batteries, ['CR2477']);
});

test('SNZB-03PR2: motion follows the occupancy reports', async () => {
  const { device, node } = await startDevice('SNZB-03PR2');
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

test('SNZB-03PR2: the illuminance is shown in lux', async () => {
  const { device, node } = await startDevice('SNZB-03PR2');

  // 10000 x log10(1000 lx) + 1
  await deliverAttributeReport(node, {
    endpointId: 1, clusterId: ILLUMINANCE_MEASUREMENT, attributeId: MEASURED_VALUE, dataTypeId: UINT16, value: Buffer.from([0x31, 0x75]),
  });
  await flushAsync();

  assert.equal(device.getCapabilityValue('measure_luminance'), 1000);
});

test('SNZB-03PR2: the detection duration is written to the PIR delay', async () => {
  const { device, sent } = await startDevice('SNZB-03PR2');
  sent.length = 0;

  await device.onSettings({
    oldSettings: {}, newSettings: { occupied_to_unoccupied_delay: 30 }, changedKeys: ['occupied_to_unoccupied_delay'],
  });

  const [write] = writes(sent, OCCUPANCY_SENSING);
  assert.deepEqual([write.attributeId, write.dataTypeId, write.valueBytes.readUInt16LE(0)], [PIR_OCCUPIED_TO_UNOCCUPIED_DELAY, UINT16, 30]);
});

test('SNZB-03PR2: the illuminance calibration is written to the eWeLink cluster', async () => {
  const { device, sent } = await startDevice('SNZB-03PR2');
  sent.length = 0;

  await device.onSettings({
    oldSettings: {}, newSettings: { illuminance_calibration: -200 }, changedKeys: ['illuminance_calibration'],
  });

  const [write] = writes(sent, SONOFF);
  assert.deepEqual([write.attributeId, write.dataTypeId, write.valueBytes.readInt16LE(0)], [ILLUMINATION_COMPENSATION_OFFSET, INT16, -200]);
});

test('SNZB-03PR2: the values of the sensor are shown in the settings', async () => {
  const offset = Buffer.alloc(2);
  offset.writeInt16LE(150);
  const { device } = await startDevice('SNZB-03PR2', {
    attributeValues: {
      1: {
        [OCCUPANCY_SENSING]: { [PIR_OCCUPIED_TO_UNOCCUPIED_DELAY]: Buffer.from([UINT16, 45, 0]) },
        [SONOFF]: { [ILLUMINATION_COMPENSATION_OFFSET]: Buffer.concat([Buffer.from([INT16]), offset]) },
      },
    },
  });
  await flushAsync();

  assert.equal(device.getSettings().occupied_to_unoccupied_delay, 45);
  assert.equal(device.getSettings().illuminance_calibration, 150);
});
