'use strict';

const SonoffBase = require('../sonoffbase');
const { CLUSTER } = require('zigbee-clusters');

class SonoffZBMINI extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        if (this.hasCapability('onoff')) {
            this.registerCapability('onoff', CLUSTER.ON_OFF);
        }
    }

    async onDeleted() {
        this.log('ZBMINI switch removed');
        await super.onDeleted();
    }

}

module.exports = SonoffZBMINI;
