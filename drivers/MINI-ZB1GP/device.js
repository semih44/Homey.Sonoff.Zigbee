'use strict';

const SonoffBase = require('../sonoffbase');
const SonoffCluster = require('../../lib/SonoffCluster');

// The meter sends this when it has no reading (gpmachado, homey.gpm.sonoff, checked on the device)
const NO_READING = 0xFFFFFFFF;

// Power is a signed 32-bit value carried in an unsigned attribute (zigbee-herdsman-converters
// signedInt32MilliToValue): negative while energy flows back through the meter
function signed32(value) {
    return value > 0x7FFFFFFF ? value - 0x100000000 : value;
}

// The live values and the counters of the eWeLink cluster, with their scale to Homey's units
const MEASUREMENTS = {
    ac_power: { capability: 'measure_power', parse: value => signed32(value) / 1000 }, // mW
    ac_current: { capability: 'measure_current', parse: value => value / 1000 }, // mA
    ac_voltage: { capability: 'measure_voltage', parse: value => value / 1000 }, // mV
    total_energy: { capability: 'meter_power', parse: value => value / 1000 }, // Wh
    total_output_energy: { capability: 'meter_power.exported', parse: value => value / 1000 }, // Wh
};

// SONOFF MINI-ZB1GP power meter, after zigbee-herdsman-converters; reporting and the "no reading"
// value as gpmachado verified them on the device (homey.gpm.sonoff)
class SonoffMINIZB1GP extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        const cluster = zclNode.endpoints[1].clusters[SonoffCluster.NAME];
        for (const [attribute, { capability, parse }] of Object.entries(MEASUREMENTS)) {
            cluster.on(`attr.${attribute}`, (value) => {
                if (value === NO_READING || !this.hasCapability(capability)) return;
                this.setCapabilityValue(capability, parse(value)).catch(this.error);
            });
        }

        this.checkAttributes();
    }

    // Voltage from 60 s to 5 min on 2 V, current from 10 s to 5 min on 0.1 A (accepted by the device,
    // gpmachado); the counters from 1 to 2 minutes on every Wh
    reportingConfigurations() {
        const sonoff = (attributeName, minInterval, maxInterval, minChange) => ({
            endpointId: 1, cluster: SonoffCluster, attributeName, minInterval, maxInterval, minChange,
        });
        return [
            ...super.reportingConfigurations(),
            sonoff('ac_voltage', 60, 300, 2000),
            sonoff('ac_current', 10, 300, 100),
            sonoff('total_energy', 60, 120, 1),
            sonoff('total_output_energy', 60, 120, 1),
        ];
    }

    async onSettings({ newSettings, changedKeys }) {
        const attributes = {};
        if (changedKeys.includes('network_led')) {
            attributes.network_led = newSettings.network_led;
        }
        if (changedKeys.includes('turbo_mode')) {
            attributes.turbo_mode = SonoffCluster.turboModeToRadioPower(newSettings.turbo_mode);
        }
        await this.writeAttributes(SonoffCluster, attributes);
    }

    async checkAttributes() {
        this.readAttribute(SonoffCluster, ['network_led', 'turbo_mode', ...Object.keys(MEASUREMENTS)], (data) => {
            const settings = {};
            if (data.network_led !== undefined) settings.network_led = data.network_led;
            if (data.turbo_mode !== undefined) settings.turbo_mode = SonoffCluster.radioPowerToTurboMode(data.turbo_mode);
            if (Object.keys(settings).length > 0) this.setSettings(settings).catch(this.error);

            for (const [attribute, { capability, parse }] of Object.entries(MEASUREMENTS)) {
                const value = data[attribute];
                if (value !== undefined && value !== NO_READING && this.hasCapability(capability)) {
                    this.setCapabilityValue(capability, parse(value)).catch(this.error);
                }
            }
        });
    }

}

module.exports = SonoffMINIZB1GP;
