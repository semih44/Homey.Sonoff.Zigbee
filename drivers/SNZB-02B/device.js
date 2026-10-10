'use strict';

const TempHumiditySensor = require('../temphumiditysensor');
const SonoffCluster = require('../../lib/SonoffCluster');

class SonoffSNZB02B extends TempHumiditySensor {

    // zigbee-herdsman-converters SNZB-02B: on a change of 0.2 °C / 1 %RH, at most every 5 s
    get measurementReporting() {
        return {
            temperature: { minInterval: 5, maxInterval: 3600, minChange: 20 },
            humidity: { minInterval: 5, maxInterval: 3600, minChange: 100 },
        };
    }

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
    }

    async checkAttributes() {
        this.readAttribute(SonoffCluster, ['temperature_calibration', 'humidity_calibration'], (data) => {
            const settings = {};
            if (data.temperature_calibration !== undefined) settings.temperature_calibration = data.temperature_calibration / 100;
            if (data.humidity_calibration !== undefined) settings.humidity_calibration = data.humidity_calibration / 100;
            if (Object.keys(settings).length > 0) {
                this.setSettings(settings).catch(this.error);
            }
        });
    }

}

module.exports = SonoffSNZB02B;
