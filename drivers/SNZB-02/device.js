'use strict';

const TempHumiditySensor = require('../temphumiditysensor');

class SonoffSNZB02 extends TempHumiditySensor {

    // zigbee-herdsman-converters SNZB-02: on a change of 0.2 °C / 1 %RH, at most every 30 s
    get measurementReporting() {
        return {
            temperature: { minInterval: 30, maxInterval: 3600, minChange: 20 },
            humidity: { minInterval: 30, maxInterval: 3600, minChange: 100 },
        };
    }

}

module.exports = SonoffSNZB02;
