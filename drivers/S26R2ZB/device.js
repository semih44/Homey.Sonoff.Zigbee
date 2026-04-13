'use strict';

const SonoffBase = require('../sonoffbase');
const { CLUSTER } = require('zigbee-clusters');

class SonoffS26R2ZB extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        if (this.hasCapability('onoff')) {
            this.registerCapability('onoff', CLUSTER.ON_OFF);
        }

        this.checkAttributes();
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        if (changedKeys.includes('power_on_behavior')) {
            try {
                await this.zclNode.endpoints[1].clusters.onOff.writeAttributes({ powerOnBehavior: newSettings.power_on_behavior });
            } catch (error) {
                this.log('Error updating the power on behavior');
            }
        }
    }

    async checkAttributes() {
        this.readAttribute(CLUSTER.ON_OFF, ['powerOnBehavior'], (data) => {
            if (data && data.powerOnBehavior !== undefined) {
                this.setSettings({ power_on_behavior: data.powerOnBehavior }).catch(this.error);
            }
        });
    }

    async onDeleted() {
        this.log('S26R2ZB smart plug removed');
        await super.onDeleted();
    }
}

module.exports = SonoffS26R2ZB;
