'use strict';

const SonoffBase = require('../sonoffbase');
const { CLUSTER } = require('zigbee-clusters');

class SonoffS26R2ZB extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        if (this.hasCapability('onoff')) {
            this.registerCapability('onoff', CLUSTER.ON_OFF);
        }
    }

    async onDeleted() {
        this.log('S26R2ZB smart plug removed');
        await super.onDeleted();
    }
}

module.exports = SonoffS26R2ZB;
