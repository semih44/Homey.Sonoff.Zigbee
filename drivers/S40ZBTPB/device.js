'use strict';

const SonoffBase = require('../sonoffbase');
const { CLUSTER } = require('zigbee-clusters');

class SonoffS40ZBTPB extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        if (this.hasCapability('onoff')) {
            this.registerCapability('onoff', CLUSTER.ON_OFF);
        }
    }

    async onDeleted() {
        this.log('S40ZBTPB smart plug removed');
        await super.onDeleted();
    }
}

module.exports = SonoffS40ZBTPB;
