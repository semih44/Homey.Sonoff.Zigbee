'use strict';

const { CLUSTER } = require('zigbee-clusters');
const TempHumiditySensor = require('../temphumiditysensor');
const SonoffCluster = require('../../lib/SonoffCluster');

class SonoffSNZB02DR2 extends TempHumiditySensor {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        if (this.hasCapability('onoff')) {
            this.registerCapability('onoff', CLUSTER.ON_OFF);
        }

        this.checkAttributes();
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        // Zigbee device calibration (scale: value * 100)
        if (changedKeys.includes('temperature_calibration')) {
            await this.writeAttribute(SonoffCluster, 'temperature_calibration', Math.round(newSettings.temperature_calibration * 100));
        }
        if (changedKeys.includes('humidity_calibration')) {
            await this.writeAttribute(SonoffCluster, 'humidity_calibration', Math.round(newSettings.humidity_calibration * 100));
        }

        // Temperature display units (0=Celsius, 1=Fahrenheit)
        if (changedKeys.includes('temperature_units')) {
            await this.writeAttribute(SonoffCluster, 'temperature_units', parseInt(newSettings.temperature_units, 10));
        }

        // Comfort thresholds (scale: value * 100)
        if (changedKeys.includes('comfort_temperature_min')) {
            await this.writeAttribute(SonoffCluster, 'comfort_temperature_min', Math.round(newSettings.comfort_temperature_min * 100));
        }
        if (changedKeys.includes('comfort_temperature_max')) {
            await this.writeAttribute(SonoffCluster, 'comfort_temperature_max', Math.round(newSettings.comfort_temperature_max * 100));
        }
        if (changedKeys.includes('comfort_humidity_min')) {
            await this.writeAttribute(SonoffCluster, 'comfort_humidity_min', Math.round(newSettings.comfort_humidity_min * 100));
        }
        if (changedKeys.includes('comfort_humidity_max')) {
            await this.writeAttribute(SonoffCluster, 'comfort_humidity_max', Math.round(newSettings.comfort_humidity_max * 100));
        }
    }

    async checkAttributes() {
        this.readAttribute(SonoffCluster, [
            'temperature_calibration', 'humidity_calibration', 'temperature_units',
            'comfort_temperature_min', 'comfort_temperature_max',
            'comfort_humidity_min', 'comfort_humidity_max'
        ], (data) => {
            const settings = {};
            if (data.temperature_calibration !== undefined) settings.temperature_calibration = data.temperature_calibration / 100;
            if (data.humidity_calibration !== undefined) settings.humidity_calibration = data.humidity_calibration / 100;
            if (data.temperature_units !== undefined) settings.temperature_units = String(data.temperature_units);
            if (data.comfort_temperature_min !== undefined) settings.comfort_temperature_min = data.comfort_temperature_min / 100;
            if (data.comfort_temperature_max !== undefined) settings.comfort_temperature_max = data.comfort_temperature_max / 100;
            if (data.comfort_humidity_min !== undefined) settings.comfort_humidity_min = data.comfort_humidity_min / 100;
            if (data.comfort_humidity_max !== undefined) settings.comfort_humidity_max = data.comfort_humidity_max / 100;
            if (Object.keys(settings).length > 0) {
                this.setSettings(settings).catch(this.error);
            }
        });
    }

}

module.exports = SonoffSNZB02DR2;
