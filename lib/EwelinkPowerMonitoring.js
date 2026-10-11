'use strict';

const SonoffCluster = require('./SonoffCluster');

// Power monitoring of the eWeLink MINI-ZB1 family (zigbee-herdsman-converters MINI-ZB1GP, MINI-ZB1GSP):
// live values and energy counters in the eWeLink cluster. Reporting and the "no reading" value as
// Gabriel Pedrosa Machado verified them on the MINI-ZB1GP (github.com/gpmachado/homey.gpm.sonoff).

// The meter sends this when it has no reading
const NO_READING = 0xFFFFFFFF;

// Power is a signed 32-bit value carried in an unsigned attribute (zigbee-herdsman-converters
// signedInt32MilliToValue): negative while energy flows back through the meter
function signed32(value) {
    return value > 0x7FFFFFFF ? value - 0x100000000 : value;
}

// Attribute -> capability and the scale to Homey's units
const MEASUREMENTS = {
    ac_power: { capability: 'measure_power', parse: value => signed32(value) / 1000 }, // mW
    ac_current: { capability: 'measure_current', parse: value => value / 1000 }, // mA
    ac_voltage: { capability: 'measure_voltage', parse: value => value / 1000 }, // mV
    total_energy: { capability: 'meter_power', parse: value => value / 1000 }, // Wh
    total_output_energy: { capability: 'meter_power.exported', parse: value => value / 1000 }, // Wh
};

// What a switched-off relay shows: no power and no current (zigbee-herdsman-converters on_off_clear_electricity)
const ZERO_WHEN_OFF = ['measure_power', 'measure_current'];

/**
 * Shows a reported or read measurement on the device
 * @param {Homey.Device} device
 * @param {string} attribute - one of MEASUREMENTS
 * @param {number} value - raw value
 * @param {{ whileOn?: boolean }} [options] - whileOn: power and current read 0 while onoff is off
 */
function showMeasurement(device, attribute, value, { whileOn = false } = {}) {
    const { capability, parse } = MEASUREMENTS[attribute];
    if (value === undefined || value === NO_READING || !device.hasCapability(capability)) return;
    const off = whileOn && ZERO_WHEN_OFF.includes(capability) && device.getCapabilityValue('onoff') === false;
    device.setCapabilityValue(capability, off ? 0 : parse(value)).catch(device.error);
}

/**
 * Listens to the measurements of the eWeLink cluster
 * @param {Homey.Device} device
 * @param {object} cluster - the eWeLink cluster of endpoint 1
 * @param {{ whileOn?: boolean }} [options]
 */
function listenToMeasurements(device, cluster, options) {
    for (const attribute of Object.keys(MEASUREMENTS)) {
        cluster.on(`attr.${attribute}`, value => showMeasurement(device, attribute, value, options));
    }
}

/**
 * Shows no power and no current once the relay reports off, as the switch keeps reporting its
 * last power (zigbee2mqtt issue 28470)
 * @param {Homey.Device} device
 * @param {object} onOffCluster - the On/Off cluster of endpoint 1
 */
function clearWhenOff(device, onOffCluster) {
    onOffCluster.on('attr.onOff', (on) => {
        if (on) return;
        for (const capability of ZERO_WHEN_OFF) device.setCapabilityValue(capability, 0).catch(device.error);
    });
}

// Voltage from 60 s to 5 min on 2 V, current from 10 s to 5 min on 0.1 A (accepted by the device);
// the counters from 1 to 2 minutes on every Wh
function measurementReporting({ exported = true } = {}) {
    const sonoff = (attributeName, minInterval, maxInterval, minChange) => ({
        endpointId: 1, cluster: SonoffCluster, attributeName, minInterval, maxInterval, minChange,
    });
    return [
        sonoff('ac_voltage', 60, 300, 2000),
        sonoff('ac_current', 10, 300, 100),
        sonoff('total_energy', 60, 120, 1),
        ...(exported ? [sonoff('total_output_energy', 60, 120, 1)] : []),
    ];
}

module.exports = {
    MEASUREMENTS, NO_READING, showMeasurement, listenToMeasurements, clearWhenOff, measurementReporting,
};
