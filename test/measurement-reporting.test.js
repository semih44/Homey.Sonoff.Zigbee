'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { deliverAttributeReport, configuredReporting } = require('./helpers/zigbee');
const { flushAsync, waitFor } = require('./helpers/device');
const { startDevice } = require('./helpers/start');

const TEMPERATURE = 0x0402;
const HUMIDITY = 0x0405;
const MEASURED_VALUE = 0x0000;
const INT16 = 0x29;

// zigbee-herdsman-converters sonoff.ts: [min s, max s, change] with the change in 0.01 °C / 0.01 %RH.
// Models without an override use the m.temperature()/m.humidity() default of 10 s, 1 h, 100.
const Z2M_REPORTING = {
  'SNZB-02': { [TEMPERATURE]: [30, 3600, 20], [HUMIDITY]: [30, 3600, 100] },
  'SNZB-02B': { [TEMPERATURE]: [5, 3600, 20], [HUMIDITY]: [5, 3600, 100] },
  'SNZB-02WD': { [TEMPERATURE]: [5, 3600, 20], [HUMIDITY]: [5, 3600, 100] },
  'SNZB-02D': { [TEMPERATURE]: [10, 3600, 100], [HUMIDITY]: [10, 3600, 100] },
  'SNZB-02DR2': { [TEMPERATURE]: [10, 3600, 100], [HUMIDITY]: [10, 3600, 100] },
  'SNZB-02P': { [TEMPERATURE]: [10, 3600, 100], [HUMIDITY]: [10, 3600, 100] },
  'SNZB-02LD': { [TEMPERATURE]: [5, 3600, 20] },
};

function expectedReporting(driver) {
  return Object.entries(Z2M_REPORTING[driver]).map(([clusterId, [minInterval, maxInterval, minChange]]) => ({
    clusterId: Number(clusterId), attributeId: MEASURED_VALUE, minInterval, maxInterval, minChange,
  }));
}

// The measurement part of the reporting configuration (the battery has its own tests)
function measurementReporting(sent) {
  return configuredReporting(sent).filter(record => [TEMPERATURE, HUMIDITY].includes(record.clusterId))
    .sort((a, b) => a.clusterId - b.clusterId);
}

function reportTemperature(node, value) {
  const bytes = Buffer.alloc(2);
  bytes.writeInt16LE(value);
  return deliverAttributeReport(node, {
    endpointId: 1, clusterId: TEMPERATURE, attributeId: MEASURED_VALUE, dataTypeId: INT16, value: bytes,
  });
}

for (const driver of Object.keys(Z2M_REPORTING)) {
  test(`${driver}: a new sensor reports as zigbee-herdsman-converters configures it`, async () => {
    const { sent } = await startDevice(driver, { firstInit: true });

    assert.deepEqual(measurementReporting(sent), expectedReporting(driver));
  });

  test(`${driver}: a sensor paired with an older version is configured again`, async () => {
    const { sent } = await startDevice(driver);

    assert.deepEqual(measurementReporting(sent), expectedReporting(driver));
  });

  test(`${driver}: a configured sensor is not configured again on the next start`, async () => {
    const first = await startDevice(driver);
    await waitFor(() => measurementReporting(first.sent).length > 0, { label: 'first start configured' });
    await flushAsync();

    // Homey keeps the store; the device starts with a new instance
    const { sent } = await startDevice(driver, { store: { ...first.device.__fake.store } });

    assert.deepEqual(configuredReporting(sent), []);
  });

  test(`${driver}: a sleeping sensor is configured after its next report, when it is awake`, async () => {
    const { recorded, node, sent } = await startDevice(driver, { failSend: true });
    // homey-zigbeedriver retries the failed request behind timers before giving up
    await waitFor(() => recorded.errors.some(([message]) => String(message).includes('configure attribute reporting')),
      { label: 'failed configuration logged' });
    assert.deepEqual(configuredReporting(sent), []);

    node.failSend = false;
    await reportTemperature(node, 2150);
    await flushAsync();
    assert.deepEqual(measurementReporting(sent), expectedReporting(driver));

    const configured = configuredReporting(sent).length;
    await reportTemperature(node, 2160);
    await flushAsync();
    assert.equal(configuredReporting(sent).length, configured, 'configured only once');
  });
}
