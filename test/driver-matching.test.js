'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { zigbeeDrivers, matchingDrivers, asArray } = require('./helpers/compose');

// Model ids devices report, from zigbee-herdsman-converters sonoff.ts (zigbeeModel / fingerprints)
const DEVICES = [
  { manufacturerName: 'SONOFF', modelId: 'S31 Lite zb', driver: 'S31ZB' },
  { manufacturerName: 'SONOFF', modelId: 'S40LITE', driver: 'S40ZBTPB' },
  { manufacturerName: 'eWeLink', modelId: 'WB01', driver: 'SNZB-01' },
  { manufacturerName: 'eWeLink', modelId: 'WB-01', driver: 'SNZB-01' },
  { manufacturerName: 'eWeLink', modelId: 'SNZB-01', driver: 'SNZB-01' },
  { manufacturerName: 'eWeLink', modelId: 'CK-TLSR8656-SS5-01(7000)', driver: 'SNZB-01' },
  { manufacturerName: 'eWeLink', modelId: 'TH01', driver: 'SNZB-02' },
  { manufacturerName: 'eWeLink', modelId: 'SNZB-02', driver: 'SNZB-02' },
  { manufacturerName: 'eWeLink', modelId: 'CK-TLSR8656-SS5-01(7014)', driver: 'SNZB-02' },
  { manufacturerName: 'eWeLink', modelId: 'MS01', driver: 'SNZB-03' },
  { manufacturerName: 'eWeLink', modelId: 'MSO1', driver: 'SNZB-03' },
  { manufacturerName: 'eWeLink', modelId: 'SNZB-03', driver: 'SNZB-03' },
  { manufacturerName: 'eWeLink', modelId: 'CK-TLSR8656-SS5-01(7002)', driver: 'SNZB-03' },
  { manufacturerName: 'eWeLink', modelId: 'DS01', driver: 'SNZB-04' },
  { manufacturerName: 'eWeLink', modelId: 'SNZB-04', driver: 'SNZB-04' },
  { manufacturerName: 'eWeLink', modelId: 'CK-TLSR8656-SS5-01(7003)', driver: 'SNZB-04' },
  { manufacturerName: 'SONOFF', modelId: 'ZBMINIR2', driver: 'ZBMINIR2' },
  { manufacturerName: 'SONOFF', modelId: 'MINI-ZBD', driver: 'ZBMINIR2' },
];

for (const { manufacturerName, modelId, driver } of DEVICES) {
  test(`a ${manufacturerName} "${modelId}" pairs with the ${driver} driver`, () => {
    assert.deepEqual(matchingDrivers(manufacturerName, modelId), [driver]);
  });
}

test('no two drivers claim the same manufacturer name and model id', () => {
  const claims = {};
  for (const { id, zigbee } of zigbeeDrivers()) {
    for (const manufacturerName of asArray(zigbee.manufacturerName)) {
      for (const productId of asArray(zigbee.productId)) {
        const key = `${manufacturerName} / ${productId}`;
        claims[key] = [...(claims[key] || []), id];
      }
    }
  }
  const conflicts = Object.entries(claims).filter(([, drivers]) => drivers.length > 1);
  assert.deepEqual(conflicts, []);
});
