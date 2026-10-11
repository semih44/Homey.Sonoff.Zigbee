'use strict';

const { CLUSTER } = require('zigbee-clusters');

// Battery reporting as zigbee-herdsman-converters configures it, [min s, max s, change]:
// - ewelinkBattery(): the eWeLink sensors report at least every 2 hours. "3600/7200 prevents disconnect"
//   (zigbee2mqtt issue 13600): without regular traffic they leave the network.
// - m.battery(): the percentage between 1 hour and repInterval.MAX (65000 s), on a change of 10 (5 %).
// percentage is batteryPercentageRemaining (0.5 % units), voltage is batteryVoltage (0.1 V units).
const EWELINK = { percentage: [3600, 7200, 2], voltage: [3600, 7200, 100] };
const DEFAULT = { percentage: [3600, 65000, 10] };
const WITH_VOLTAGE = { ...DEFAULT, voltage: [3600, 65000, 10] };

const BATTERY_REPORTING = {
    'SNZB-01': EWELINK,
    'SNZB-01-KF': EWELINK,
    'SNZB-03': EWELINK,
    'SNZB-03P': EWELINK,
    'SNZB-04': EWELINK,
    'SNZB-04P': EWELINK,
    'SNZB-01P': { percentage: [3600, 7200, 0], voltage: [3600, 7200, 0] },
    'SNZB-04PR2': { percentage: [3600, 7200, 2] },
    'SNZB-01M': DEFAULT,
    'SNZB-03PR2': DEFAULT,
    'SNZB-05P': DEFAULT,
    'SNZB-02': { percentage: [3600, 65000, 0], voltage: [3600, 65000, 0] },
    'SNZB-02B': DEFAULT,
    'SNZB-02D': DEFAULT,
    'SNZB-02LD': DEFAULT,
    'SNZB-02P': DEFAULT,
    'SNZB-02DR2': WITH_VOLTAGE,
    'SNZB-02WD': WITH_VOLTAGE,
    SWV: DEFAULT,
    // zigbee-herdsman-converters treats SWV-ZNU and SWV-ZFU as white labels of SWV-ZNE and SWV-ZFE
    'SWV-ZNE': DEFAULT,
    'SWV-ZNU': DEFAULT,
    'SWV-ZFE': DEFAULT,
    'SWV-ZFU': DEFAULT,
};

const ATTRIBUTES = { percentage: 'batteryPercentageRemaining', voltage: 'batteryVoltage' };

/**
 * Attribute reporting configurations for the battery of a driver, or none without a reference
 * @param {string} driverId
 * @returns {object[]} as for configureAttributeReporting
 */
function batteryReporting(driverId) {
    return Object.entries(BATTERY_REPORTING[driverId] || {}).map(([kind, [minInterval, maxInterval, minChange]]) => ({
        endpointId: 1,
        cluster: CLUSTER.POWER_CONFIGURATION,
        attributeName: ATTRIBUTES[kind],
        minInterval,
        maxInterval,
        minChange,
    }));
}

module.exports = { batteryReporting };
