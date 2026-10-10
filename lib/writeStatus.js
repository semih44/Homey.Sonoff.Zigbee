'use strict';

const WRITE_REJECTED = 'WRITE_REJECTED';

/**
 * zigbee-clusters only fails a write when the device answers with a default response.
 * A writeAttributesResponse instead lists a status record per rejected attribute
 * (a single SUCCESS record when everything was written), so it is checked here.
 * @param {object} response - result of Cluster#writeAttributes
 * @throws {Error} with code WRITE_REJECTED when the device rejected an attribute
 */
function assertWriteSucceeded(response) {
  const records = (response && response.attributes) || [];
  const rejected = records.filter(record => record.status !== 'SUCCESS');
  if (rejected.length === 0) return;

  const details = rejected
    .map(record => `0x${record.id.toString(16).padStart(4, '0')}: ${record.status}`)
    .join(', ');
  const error = new Error(`Device rejected the write (${details})`);
  error.code = WRITE_REJECTED;
  throw error;
}

module.exports = { assertWriteSucceeded, WRITE_REJECTED };
