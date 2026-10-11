'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { deliverAttributeReport, configuredReporting } = require('./helpers/zigbee');
const { flushAsync } = require('./helpers/device');
const { startDevice } = require('./helpers/start');

const POWER_CONFIGURATION = 0x0001;
const BATTERY_VOLTAGE = 0x0020;
const BATTERY_PERCENTAGE_REMAINING = 0x0021;
const UINT8 = 0x20;

// zigbee-herdsman-converters: [min s, max s, change]. ewelinkBattery() makes the eWeLink sensors report at
// least every 2 hours ("3600/7200 prevents disconnect", zigbee2mqtt issue 13600); m.battery() reports the
// percentage between 1 hour and repInterval.MAX (65000 s) on a change of 10 (5 %).
const EWELINK = { [BATTERY_PERCENTAGE_REMAINING]: [3600, 7200, 2], [BATTERY_VOLTAGE]: [3600, 7200, 100] };
const DEFAULT = { [BATTERY_PERCENTAGE_REMAINING]: [3600, 65000, 10] };
const WITH_VOLTAGE = { ...DEFAULT, [BATTERY_VOLTAGE]: [3600, 65000, 10] };
const Z2M_BATTERY = {
  'SNZB-01': EWELINK,
  'SNZB-01-KF': EWELINK,
  'SNZB-03': EWELINK,
  'SNZB-03P': EWELINK,
  'SNZB-04': EWELINK,
  'SNZB-04P': EWELINK,
  'SNZB-01P': { [BATTERY_PERCENTAGE_REMAINING]: [3600, 7200, 0], [BATTERY_VOLTAGE]: [3600, 7200, 0] },
  'SNZB-04PR2': { [BATTERY_PERCENTAGE_REMAINING]: [3600, 7200, 2] },
  'SNZB-01M': DEFAULT,
  'SNZB-05P': DEFAULT,
  'SNZB-02': { [BATTERY_PERCENTAGE_REMAINING]: [3600, 65000, 0], [BATTERY_VOLTAGE]: [3600, 65000, 0] },
  'SNZB-02B': DEFAULT,
  'SNZB-02D': DEFAULT,
  'SNZB-02LD': DEFAULT,
  'SNZB-02P': DEFAULT,
  'SNZB-02DR2': WITH_VOLTAGE,
  'SNZB-02WD': WITH_VOLTAGE,
  SWV: DEFAULT,
  'SWV-ZNE': DEFAULT,
  'SWV-ZNU': DEFAULT,
  'SWV-ZFE': DEFAULT,
  'SWV-ZFU': DEFAULT,
};

// Only the battery cluster's frames are decoded: zigbee-clusters cannot parse bitmap types back
// (e.g. the occupancy record of the motion sensors), although it sends them correctly
function batteryReporting(sent) {
  return configuredReporting(sent.filter(frame => frame.clusterId === POWER_CONFIGURATION))
    .map(({ attributeId, minInterval, maxInterval, minChange }) => ({ attributeId, minInterval, maxInterval, minChange }))
    .sort((a, b) => a.attributeId - b.attributeId);
}

function expected(driver) {
  return Object.entries(Z2M_BATTERY[driver])
    .map(([attributeId, [minInterval, maxInterval, minChange]]) => ({ attributeId: Number(attributeId), minInterval, maxInterval, minChange }))
    .sort((a, b) => a.attributeId - b.attributeId);
}

function reportBattery(node, value) {
  return deliverAttributeReport(node, {
    endpointId: 1, clusterId: POWER_CONFIGURATION, attributeId: BATTERY_PERCENTAGE_REMAINING, dataTypeId: UINT8, value: Buffer.from([value]),
  });
}

for (const driver of Object.keys(Z2M_BATTERY)) {
  test(`${driver}: the battery reports as zigbee-herdsman-converters configures it`, async () => {
    const { sent } = await startDevice(driver, { firstInit: true });

    assert.deepEqual(batteryReporting(sent), expected(driver));
  });

  test(`${driver}: the battery cluster is bound, so its reports reach Homey`, () => {
    const manifest = require(`../drivers/${driver}/driver.compose.json`);

    assert.ok(manifest.zigbee.endpoints['1'].bindings.includes(POWER_CONFIGURATION));
  });
}

test('a reported battery level is shown, in 0.5 % units', async () => {
  const { device, node } = await startDevice('SNZB-04P');

  await reportBattery(node, 150);
  await flushAsync();

  assert.equal(device.getCapabilityValue('measure_battery'), 75);
});

test('a reported unknown battery level (0xFF) is not shown', async () => {
  const { device, node } = await startDevice('SNZB-04P', { capabilities: { alarm_contact: false, alarm_tamper: false, measure_battery: 60 } });

  await reportBattery(node, 0xFF);
  await flushAsync();

  assert.equal(device.getCapabilityValue('measure_battery'), 60);
});

test('a mains powered device gets no battery reporting', async () => {
  const { sent } = await startDevice('ZBMINIL2', { firstInit: true });

  assert.deepEqual(batteryReporting(sent), []);
});
