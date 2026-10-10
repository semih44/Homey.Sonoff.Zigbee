'use strict';

const { ZigBeeDriver } = require('homey-zigbeedriver');

class SonoffSNZB06PDriver extends ZigBeeDriver {

    async onInit() {
        // Registered once per driver: Homey passes the device selected in the flow as args.device
        this.homey.flow.getConditionCard('is_bright')
            .registerRunListener(async (args) => args.device.getCapabilityValue('sonoff_illuminance') === 'bright');
    }

}

module.exports = SonoffSNZB06PDriver;
