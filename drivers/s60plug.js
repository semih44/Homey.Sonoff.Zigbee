'use strict';

const SonoffBase = require('./sonoffbase');
const { CLUSTER } = require('zigbee-clusters');

// Factors the capability parsers of homey-zigbeedriver multiply the measured values with. Until the
// plug reports its multiplier and divisor, the scaling of earlier versions applies (mA, Wh).
const DEFAULT_FACTORS = {
    activePowerFactor: 1,
    acVoltageFactor: 1,
    acCurrentFactor: 1 / 1000,
    meteringFactor: 1 / 1000,
};
const FACTORS_STORE_KEY = 'measurementFactors';

// The measurement capabilities and where homey-zigbeedriver reads them
const MEASUREMENTS = [
    ['measure_power', CLUSTER.ELECTRICAL_MEASUREMENT],
    ['measure_voltage', CLUSTER.ELECTRICAL_MEASUREMENT],
    ['measure_current', CLUSTER.ELECTRICAL_MEASUREMENT],
    ['meter_power', CLUSTER.METERING],
];

// The scaling a multiplier/divisor pair stands for, or undefined when the plug reported no usable pair
function factor(multiplier, divisor) {
    return multiplier > 0 && divisor > 0 ? multiplier / divisor : undefined;
}

// SONOFF S60ZBTPF/S60ZBTPG smart plugs with power measurement
class S60Plug extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        Object.assign(this, DEFAULT_FACTORS, this.getStoreValue(FACTORS_STORE_KEY));

        if (this.hasCapability('onoff')) {
            this.registerCapability('onoff', CLUSTER.ON_OFF);
        }

        // Firmware before 2.0.3 keeps reporting power and current after being switched off;
        // zigbee-herdsman-converters and ZHA show 0 while the plug is off
        if (this.hasCapability('measure_power')) {
            this.registerCapability('measure_power', CLUSTER.ELECTRICAL_MEASUREMENT, {
                reportParser: value => this._measuredWhileOn(value, this.activePowerFactor),
            });
        }

        if (this.hasCapability('measure_voltage')) {
            this.registerCapability('measure_voltage', CLUSTER.ELECTRICAL_MEASUREMENT);
        }

        if (this.hasCapability('measure_current')) {
            this.registerCapability('measure_current', CLUSTER.ELECTRICAL_MEASUREMENT, {
                reportParser: value => this._measuredWhileOn(value, this.acCurrentFactor),
            });
        }

        if (this.hasCapability('meter_power')) {
            this.registerCapability('meter_power', CLUSTER.METERING);
        }

        zclNode.endpoints[1].clusters[CLUSTER.ON_OFF.NAME].on('attr.onOff', (on) => {
            if (on) return;
            for (const capability of ['measure_power', 'measure_current']) {
                if (this.hasCapability(capability)) {
                    this.setCapabilityValue(capability, 0).catch(this.error);
                }
            }
        });

        this.readMeasurementFactors().catch(err => this.error('Could not read the measurement factors', err));
        this.checkAttributes();
    }

    _measuredWhileOn(value, scale) {
        if (value < 0) return null;
        return this.getCapabilityValue('onoff') === false ? 0 : value * scale;
    }

    // ZHA scales the standard clusters with the multiplier and divisor the plug reports,
    // zigbee-herdsman-converters reads them for the metering cluster
    async readMeasurementFactors() {
        const electrical = await this.zclNode.endpoints[1].clusters[CLUSTER.ELECTRICAL_MEASUREMENT.NAME].readAttributes(
            'acPowerMultiplier', 'acPowerDivisor',
            'acVoltageMultiplier', 'acVoltageDivisor',
            'acCurrentMultiplier', 'acCurrentDivisor'
        );
        const metering = await this.zclNode.endpoints[1].clusters[CLUSTER.METERING.NAME].readAttributes('multiplier', 'divisor');

        const reported = Object.fromEntries(Object.entries({
            activePowerFactor: factor(electrical.acPowerMultiplier, electrical.acPowerDivisor),
            acVoltageFactor: factor(electrical.acVoltageMultiplier, electrical.acVoltageDivisor),
            acCurrentFactor: factor(electrical.acCurrentMultiplier, electrical.acCurrentDivisor),
            meteringFactor: factor(metering.multiplier, metering.divisor),
        }).filter(([key, value]) => value !== undefined && value !== this[key]));
        if (Object.keys(reported).length === 0) return;

        Object.assign(this, reported);
        await this.setStoreValue(FACTORS_STORE_KEY, { ...this.getStoreValue(FACTORS_STORE_KEY), ...reported });

        // The values shown so far were scaled differently
        for (const [capability, cluster] of MEASUREMENTS) {
            if (this.hasCapability(capability)) {
                this.getClusterCapabilityValue(capability, cluster).catch(this.error);
            }
        }
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        if (changedKeys.includes('power_on_behavior')) {
            await this.writePowerOnBehavior(newSettings.power_on_behavior);
        }
    }

    async checkAttributes() {
        this.readPowerOnBehavior('power_on_behavior');
    }

}

module.exports = S60Plug;
