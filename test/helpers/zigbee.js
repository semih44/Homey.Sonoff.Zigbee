'use strict';

// Real zigbee-clusters ZCLNode on top of a fake Homey ZigBeeNode: frames are encoded and decoded
// by the library itself, only the radio is replaced.
const { ZCLNode } = require('zigbee-clusters');
const { ZCLStandardHeader, ZCLMfgSpecificHeader } = require('zigbee-clusters/lib/zclFrames');

const CMD_READ_ATTRIBUTES = 0x00;
const CMD_READ_ATTRIBUTES_RESPONSE = 0x01;
const CMD_WRITE_ATTRIBUTES = 0x02;
const CMD_WRITE_ATTRIBUTES_RESPONSE = 0x04;
const CMD_REPORT_ATTRIBUTES = 0x0A;
const FRAME_CONTROL_MANUFACTURER_SPECIFIC = 0x04;
const STATUS_SUCCESS = 0x00;
const STATUS_UNSUPPORTED_ATTRIBUTE = 0x86;

function parseFrame(buffer) {
  const Header = buffer[0] & FRAME_CONTROL_MANUFACTURER_SPECIFIC ? ZCLMfgSpecificHeader : ZCLStandardHeader;
  return Header.fromBuffer(buffer);
}

function buildFrame({ frameControl, manufacturerId, trxSequenceNumber = 0, cmdId, data }) {
  if (manufacturerId === undefined) {
    return new ZCLStandardHeader({ frameControl, trxSequenceNumber, cmdId, data }).toBuffer();
  }
  return new ZCLMfgSpecificHeader({
    frameControl: [...frameControl, 'manufacturerSpecific'], manufacturerId, trxSequenceNumber, cmdId, data,
  }).toBuffer();
}

// Read response records: attribute id, status and, when supported, data type id plus value
function readResponseData(requestData, valuesById) {
  const records = [];
  for (let i = 0; i + 1 < requestData.length; i += 2) {
    const attributeId = requestData.readUInt16LE(i);
    const idBytes = Buffer.from([attributeId & 0xff, attributeId >> 8]);
    const typedValue = valuesById[attributeId];
    records.push(typedValue
      ? Buffer.concat([idBytes, Buffer.from([STATUS_SUCCESS]), typedValue])
      : Buffer.concat([idBytes, Buffer.from([STATUS_UNSUPPORTED_ATTRIBUTE])]));
  }
  return Buffer.concat(records);
}

/**
 * @param {object} options
 * @param {Object<number, number[]>} options.endpoints - Input cluster ids per endpoint id
 * @param {object} [options.attributeValues] - endpointId -> clusterId -> attributeId -> Buffer [dataTypeId, ...value]
 * @param {boolean} [options.failSend] - Simulate an unreachable device
 * @returns {{ zclNode: ZCLNode, node: object, sent: object[] }}
 */
function createZigbeeNode({ endpoints, attributeValues = {}, failSend = false }) {
  const sent = [];
  const reply = (endpointId, clusterId, request, cmdId, data) => {
    const response = buildFrame({
      frameControl: ['directionToClient', 'disableDefaultResponse'],
      manufacturerId: request.frameControl.manufacturerSpecific ? request.manufacturerId : undefined,
      trxSequenceNumber: request.trxSequenceNumber,
      cmdId,
      data,
    });
    setImmediate(() => node.handleFrame(endpointId, clusterId, response, {}));
  };

  const node = {
    endpointDescriptors: Object.entries(endpoints).map(([endpointId, inputClusters]) => ({
      endpointId: Number(endpointId),
      inputClusters,
      outputClusters: [],
    })),
    async sendFrame(endpointId, clusterId, buffer) {
      if (failSend) throw new Error('device unreachable');
      const frame = parseFrame(buffer);
      sent.push({ endpointId, clusterId, frame });
      if (frame.frameControl.clusterSpecific) return;

      // A device answers global read/write requests with a response carrying the same trx number
      if (frame.cmdId === CMD_WRITE_ATTRIBUTES) {
        reply(endpointId, clusterId, frame, CMD_WRITE_ATTRIBUTES_RESPONSE,
          Buffer.from([STATUS_SUCCESS, frame.data[0], frame.data[1]]));
      } else if (frame.cmdId === CMD_READ_ATTRIBUTES) {
        const valuesById = (attributeValues[endpointId] || {})[clusterId] || {};
        reply(endpointId, clusterId, frame, CMD_READ_ATTRIBUTES_RESPONSE, readResponseData(frame.data, valuesById));
      }
    },
  };
  // ZCLNode installs node.handleFrame, which is how incoming frames reach the clusters
  const zclNode = new ZCLNode(node);
  return { zclNode, node, sent };
}

/**
 * Decodes the first attribute record of a captured writeAttributes frame.
 * @returns {{ attributeId: number, dataTypeId: number, valueBytes: Buffer }}
 */
function writtenAttribute(sentFrame) {
  const { data } = sentFrame.frame;
  return {
    attributeId: data.readUInt16LE(0),
    dataTypeId: data[2],
    valueBytes: data.subarray(3),
  };
}

function deliverAttributeReport(node, { endpointId, clusterId, attributeId, dataTypeId, value }) {
  const data = Buffer.concat([Buffer.from([attributeId & 0xff, attributeId >> 8, dataTypeId]), value]);
  const frame = buildFrame({
    frameControl: ['directionToClient', 'disableDefaultResponse'],
    cmdId: CMD_REPORT_ATTRIBUTES,
    data,
  });
  return node.handleFrame(endpointId, clusterId, frame, {});
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = {
  createZigbeeNode,
  writtenAttribute,
  deliverAttributeReport,
  withTimeout,
  CMD_WRITE_ATTRIBUTES,
};
