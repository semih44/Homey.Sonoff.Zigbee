'use strict';

const SonoffBase = require('../sonoffbase');
const { CLUSTER } = require('zigbee-clusters');

class SonoffSNZB05P extends SonoffBase {

    async onNodeInit({zclNode}) {

		await super.onNodeInit({zclNode}); //, {noAttribCheck:true});

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

module.exports = SonoffSNZB05P;
