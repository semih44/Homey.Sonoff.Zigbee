'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require('./helpers/homey-stub');
const {
  createZigbeeNode, deliverAttributeReport, writtenAttribute, CMD_WRITE_ATTRIBUTES,
} = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');
const { endpointsFromCompose, capabilitiesFromCompose } = require('./helpers/compose');

const SonoffBase = require('../drivers/sonoffbase');

const OCCUPANCY_SENSING = 0x0406;
const SONOFF = 0xFC11;
// Occupancy sensing: occupancy 0x0000 (bitmap8, bit 0 occupied), ultrasonic delays 0x0020/0x0021 (uint16),
// ultrasonic threshold 0x0022 (uint8); eWeLink illumination 0x2001 (uint8, 1 bright)
const OCCUPANCY = 0x0000;
const OCCUPIED_TO_UNOCCUPIED_DELAY = 0x0020;
const UNOCCUPIED_TO_OCCUPIED_THRESHOLD = 0x0022;
const ILLUMINATION = 0x2001;
const MAP8 = 0x18;
const UINT8 = 0x20;
const UINT16 = 0x21;
const INVALID_VALUE = 0x87;

// A sensor paired with the current manifest, unless capabilities from an older version are given
function sensor(driver, { capabilities = capabilitiesFromCompose(driver), ...nodeOptions } = {}) {
  const DeviceClass = require(`../drivers/${driver}/device.js`);
  const { zclNode, node, sent } = createZigbeeNode({ endpoints: endpointsFromCompose(driver), ...nodeOptions });
  const { device, recorded } = createDevice(DeviceClass, { zclNode, capabilities });
  return { device, recorded, zclNode, node, sent };
}

// Runs onNodeInit with the base class stubbed; returns the reporting configured by the sensor
async function init(device, zclNode) {
  const reporting = [];
  device.configureAttributeReporting = async configs => { reporting.push(...configs); };
  const originalBaseInit = SonoffBase.prototype.onNodeInit;
  SonoffBase.prototype.onNodeInit = async () => {};
  try {
    await device.onNodeInit({ zclNode });
  } finally {
    SonoffBase.prototype.onNodeInit = originalBaseInit;
  }
  await flushAsync();
  return reporting;
}

for (const driver of ['SNZB-03P', 'SNZB-06P', 'MG1_5RZ']) {
  test(`${driver}: motion follows the occupancy reports`, async () => {
    const { device, zclNode, node } = sensor(driver);
    await init(device, zclNode);

    const report = occupied => deliverAttributeReport(node, {
      endpointId: 1, clusterId: OCCUPANCY_SENSING, attributeId: OCCUPANCY, dataTypeId: MAP8, value: Buffer.from([occupied]),
    });

    await report(1);
    assert.equal(device.getCapabilityValue('alarm_motion'), true);
    await report(0);
    assert.equal(device.getCapabilityValue('alarm_motion'), false);
  });

  test(`${driver}: changing only the delay writes only the delay and completes on acknowledgement`, async () => {
    const { device, sent } = sensor(driver);

    await device.onSettings({
      oldSettings: {}, newSettings: { occupied_to_unoccupied_delay: 120 }, changedKeys: ['occupied_to_unoccupied_delay'],
    });

    const writes = sent.filter(s => s.clusterId === OCCUPANCY_SENSING && s.frame.cmdId === CMD_WRITE_ATTRIBUTES);
    assert.equal(writes.length, 1);
    // One record: attribute id, data type, value
    assert.deepEqual([...writes[0].frame.data.subarray(0, 5)], [OCCUPIED_TO_UNOCCUPIED_DELAY, 0x00, UINT16, 120, 0x00]);
    assert.equal(writes[0].frame.data.length, 5);
  });

  test(`${driver}: a delay the device rejects fails the settings change`, async () => {
    const { device } = sensor(driver, {
      rejectedWrites: { 1: { [OCCUPANCY_SENSING]: { [OCCUPIED_TO_UNOCCUPIED_DELAY]: INVALID_VALUE } } },
    });

    await assert.rejects(device.onSettings({
      oldSettings: {}, newSettings: { occupied_to_unoccupied_delay: 120 }, changedKeys: ['occupied_to_unoccupied_delay'],
    }), error => error.message.includes('INVALID_VALUE'));
  });
}

test('SNZB-03P: the delay is shown although the PIR sensor has no sensitivity threshold', async () => {
  const { device } = sensor('SNZB-03P', {
    attributeValues: { 1: { [OCCUPANCY_SENSING]: { [OCCUPIED_TO_UNOCCUPIED_DELAY]: Buffer.from([UINT16, 30, 0]) } } },
  });

  device.checkAttributes();
  await flushAsync();

  assert.equal(device.getSettings().occupied_to_unoccupied_delay, 30);
});

test('MG1_5RZ: no illuminance is configured, the radar has none', async () => {
  const { device, zclNode } = sensor('MG1_5RZ');

  const reporting = await init(device, zclNode);

  assert.deepEqual(reporting.filter(r => r.attributeName === 'illuminance'), []);
});

test('MG1_5RZ: a radar paired with an older version loses the illuminance it never reported', async () => {
  const { device, zclNode } = sensor('MG1_5RZ', { capabilities: { alarm_motion: false, sonoff_illuminance: null } });

  const reporting = await init(device, zclNode);

  assert.equal(device.hasCapability('sonoff_illuminance'), false);
  assert.deepEqual(reporting.filter(r => r.attributeName === 'illuminance'), []);
});

test('MG1_5RZ: the manifest offers neither illuminance nor a brightness condition', () => {
  const manifest = require('../drivers/MG1_5RZ/driver.compose.json');
  const flowFile = path.join(__dirname, '..', 'drivers', 'MG1_5RZ', 'driver.flow.compose.json');

  assert.equal(manifest.capabilities.includes('sonoff_illuminance'), false);
  assert.equal(fs.existsSync(flowFile), false);
});

for (const [driver, min, max] of [['SNZB-03P', 5, 60], ['SNZB-06P', 15, 65535], ['MG1_5RZ', 60, 65535]]) {
  test(`${driver}: the delay can be set from ${min} to ${max} s, as zigbee-herdsman-converters allows`, () => {
    const settings = require(`../drivers/${driver}/driver.settings.compose.json`);
    const delay = settings.flatMap(group => group.children).find(s => s.id === 'occupied_to_unoccupied_delay');

    assert.equal(delay.attr.min, min);
    assert.equal(delay.attr.max, max);
  });
}

test('SNZB-03P: no sensitivity is offered, the PIR sensor has none', () => {
  const settings = require('../drivers/SNZB-03P/driver.settings.compose.json');

  assert.equal(settings.flatMap(group => group.children).some(s => s.id === 'occupied_threshold'), false);
});

test('SNZB-06P: an illumination report shows "bright"', async () => {
  const { device, zclNode, node } = sensor('SNZB-06P');
  await init(device, zclNode);

  await deliverAttributeReport(node, {
    endpointId: 1, clusterId: SONOFF, attributeId: ILLUMINATION, dataTypeId: UINT8, value: Buffer.from([1]),
  });

  assert.equal(device.getCapabilityValue('sonoff_illuminance'), 'bright');
});

test('SNZB-06P: a sensitivity of "high" is written as threshold 3', async () => {
  const { device, sent } = sensor('SNZB-06P');

  await device.onSettings({ oldSettings: {}, newSettings: { occupied_threshold: '3' }, changedKeys: ['occupied_threshold'] });

  const writes = sent.filter(s => s.clusterId === OCCUPANCY_SENSING && s.frame.cmdId === CMD_WRITE_ATTRIBUTES)
    .map(writtenAttribute);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].attributeId, UNOCCUPIED_TO_OCCUPIED_THRESHOLD);
  assert.equal(writes[0].dataTypeId, UINT8);
  assert.equal(writes[0].valueBytes[0], 3);
});

test('SNZB-06P: the reported sensitivity is shown', async () => {
  const { device } = sensor('SNZB-06P', {
    attributeValues: { 1: { [OCCUPANCY_SENSING]: { [UNOCCUPIED_TO_OCCUPIED_THRESHOLD]: Buffer.from([UINT8, 3]) } } },
  });

  device.checkAttributes();
  await flushAsync();

  assert.equal(device.getSettings().occupied_threshold, '3');
});
