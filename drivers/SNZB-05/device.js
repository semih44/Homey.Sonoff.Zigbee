'use strict';

const SonoffBase = require('../sonoffbase');
const { CLUSTER } = require('zigbee-clusters');

class SonoffSNZB05 extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        zclNode.endpoints[1].clusters.iasZone.onZoneStatusChangeNotification = data => {
            this.setCapabilityValue('alarm_water', data.zoneStatus.alarm1).catch(this.error);
        };
    }

    async checkAttributes() {
        await this.readAttribute(CLUSTER.IAS_ZONE, ['zoneStatus'], (data) => {
            this.setCapabilityValue('alarm_water', data.zoneStatus.alarm1).catch(this.error);
        });
    }
}

module.exports = SonoffSNZB05;
