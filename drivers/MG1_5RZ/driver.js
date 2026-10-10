'use strict';

const { ZigBeeDriver } = require('homey-zigbeedriver');

class SonoffMG15RZDriver extends ZigBeeDriver {

    async onInit() {
        // Registered once per driver: Homey passes the device selected in the flow as args.device
        this.homey.flow.getConditionCard('mg15rz_is_bright')
            .registerRunListener(async (args) => args.device.getCapabilityValue('sonoff_illuminance') === 'bright');
    }

}

module.exports = SonoffMG15RZDriver;
