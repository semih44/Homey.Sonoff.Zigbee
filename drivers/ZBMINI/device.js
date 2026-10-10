'use strict';

const SonoffBase = require('../sonoffbase');
const { CLUSTER } = require('zigbee-clusters');

class SonoffZBMINI extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        if (this.hasCapability('onoff')) {
            this.registerCapability('onoff', CLUSTER.ON_OFF);
        }

        this.checkAttributes();
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        if (changedKeys.includes('power_on_behavior')) {
            await this.writePowerOnBehavior(newSettings.power_on_behavior);
        }
    }

    async checkAttributes() {
        this.readPowerOnBehavior('power_on_behavior');
    }

    async onDeleted() {
        this.log('ZBMINI switch removed');
        await super.onDeleted();
    }

}

module.exports = SonoffZBMINI;
