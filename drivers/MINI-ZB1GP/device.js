'use strict';

const SonoffBase = require('../sonoffbase');
const SonoffCluster = require('../../lib/SonoffCluster');
const {
    MEASUREMENTS, showMeasurement, listenToMeasurements, measurementReporting,
} = require('../../lib/EwelinkPowerMonitoring');

// SONOFF MINI-ZB1GP power meter (zigbee-herdsman-converters): power, current, voltage and the imported
// and exported energy counters of the eWeLink cluster
class SonoffMINIZB1GP extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        listenToMeasurements(this, zclNode.endpoints[1].clusters[SonoffCluster.NAME]);
        this.checkAttributes();
    }

    reportingConfigurations() {
        return [...super.reportingConfigurations(), ...measurementReporting()];
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

            for (const attribute of Object.keys(MEASUREMENTS)) showMeasurement(this, attribute, data[attribute]);
        });
    }

}

module.exports = SonoffMINIZB1GP;
