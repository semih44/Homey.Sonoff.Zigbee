'use strict';

const SonoffBase = require('../sonoffbase');

// zigbee-herdsman-converters: presses arrive as IAS zone status changes, 1 (alarm1) for a
// single press and 0 afterwards; the button has no double click or long press
class SonoffSNZB01KF extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        const singleClick = this.homey.flow.getDeviceTriggerCard(`${this.driver.id}:single_click`);
        zclNode.endpoints[1].clusters.iasZone.onZoneStatusChangeNotification = ({ zoneStatus }) => {
            if (zoneStatus.alarm1 && !zoneStatus.alarm2) {
                singleClick.trigger(this, {}, {}).catch(this.error);
            }
        };
    }

}

module.exports = SonoffSNZB01KF;
