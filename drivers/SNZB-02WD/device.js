'use strict';

const TempHumiditySensor = require('../temphumiditysensor');
const SonoffCluster = require('../../lib/SonoffCluster');

class SonoffSNZB02WD extends TempHumiditySensor {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });
        this.checkAttributes();
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        if (changedKeys.includes('temperature_calibration')) {
            await this.writeAttribute(SonoffCluster, 'temperature_calibration', Math.round(newSettings.temperature_calibration * 100));
        }
        if (changedKeys.includes('humidity_calibration')) {
            await this.writeAttribute(SonoffCluster, 'humidity_calibration', Math.round(newSettings.humidity_calibration * 100));
        }
        if (changedKeys.includes('temperature_units')) {
            await this.writeAttribute(SonoffCluster, 'temperature_units', parseInt(newSettings.temperature_units, 10));
        }
    }

    async checkAttributes() {
        this.readAttribute(SonoffCluster, ['temperature_calibration', 'humidity_calibration', 'temperature_units'], (data) => {
            const settings = {};
            if (data.temperature_calibration !== undefined) settings.temperature_calibration = data.temperature_calibration / 100;
            if (data.humidity_calibration !== undefined) settings.humidity_calibration = data.humidity_calibration / 100;
            if (data.temperature_units !== undefined) settings.temperature_units = String(data.temperature_units);
            if (Object.keys(settings).length > 0) {
                this.setSettings(settings).catch(this.error);
            }
        });
    }

}

module.exports = SonoffSNZB02WD;
