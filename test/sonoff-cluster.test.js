'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const SonoffCluster = require('../lib/SonoffCluster');
const { createZigbeeNode, deliverAttributeReport, withTimeout } = require('./helpers/zigbee');

const SONOFF_CLUSTER_ID = SonoffCluster.ID;

test('a SonoffCluster attribute write completes once the device acknowledges it', async () => {
  const { zclNode } = createZigbeeNode({ endpoints: { 1: [SONOFF_CLUSTER_ID] } });
  const cluster = zclNode.endpoints[1].clusters.SonoffCluster;

  await withTimeout(cluster.writeAttributes({ network_led: true }), 1000, 'writeAttributes');
});

test('reports of the shared eWeLink attributes 0x0014-0x0016 arrive under the names the drivers listen to', async () => {
  const cases = [
    { attributeId: 0x0014, dataTypeId: 0x10, value: [0x01], name: 'power_on_delay_state', expected: true },
    { attributeId: 0x0015, dataTypeId: 0x21, value: [0x14, 0x00], name: 'power_on_delay_time', expected: 20 },
    { attributeId: 0x0016, dataTypeId: 0x20, value: [0x01], name: 'switch_mode', expected: 1 },
  ];

  for (const { attributeId, dataTypeId, value, name, expected } of cases) {
    const { zclNode, node } = createZigbeeNode({ endpoints: { 1: [SONOFF_CLUSTER_ID] } });
    const received = [];
    zclNode.endpoints[1].clusters.SonoffCluster.on(`attr.${name}`, v => received.push(v));

    await deliverAttributeReport(node, {
      endpointId: 1, clusterId: SONOFF_CLUSTER_ID, attributeId, dataTypeId, value: Buffer.from(value),
    });

    assert.deepEqual(received, [expected], `report of 0x${attributeId.toString(16)} should emit attr.${name}`);
  }
});
