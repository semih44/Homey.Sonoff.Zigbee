'use strict';

const { ZigBeeDriver } = require('homey-zigbeedriver');

class SonoffTRVZBDriver extends ZigBeeDriver {

    async onInit() {
        // Registered once per driver: Homey passes the device selected in the flow as args.device
        this.homey.flow.getActionCard('set_external_temperature')
            .registerRunListener(async ({ device, temperature }) => device.setExternalTemperature(temperature));
    }

}

module.exports = SonoffTRVZBDriver;
