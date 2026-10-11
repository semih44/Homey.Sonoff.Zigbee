'use strict';

/**
 * A measured value as the settings of the sensor show it
 * @param {number} measuredValue - in 0.01 units (ZCL temperature and relative humidity)
 * @param {number} [offset=0] - added to the value
 * @param {string} [decimals='1'] - '1' or '2', the value is rounded after adding the offset
 * @returns {number}
 */
function shownMeasurement(measuredValue, offset = 0, decimals = '1') {
  const factor = decimals === '2' ? 100 : 10;
  return Math.round((measuredValue / 100 + (offset || 0)) * factor) / factor;
}

module.exports = { shownMeasurement };
