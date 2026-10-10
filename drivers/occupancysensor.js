'use strict';

const SonoffBase = require('./sonoffbase');
const { CLUSTER } = require('zigbee-clusters');
const SonoffCluster = require('../lib/SonoffCluster');

// The sensitivity (threshold) only exists on the radar sensors; the SNZB-03P PIR sensor
// answers that it does not support it, and the read result then simply lacks it
const OCCUPANCY_ATTRIBUTES = [
    'occupancy',
    'ultrasonicOccupiedToUnoccupiedDelay',
    'ultrasonicUnoccupiedToOccupiedThreshold'
];

class OccupancySensor extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        const reporting = [
            {
                endpointId: 1,
                cluster: CLUSTER.OCCUPANCY_SENSING,
                attributeName: 'occupancy'
            }
        ];
        if (this.hasCapability('sonoff_illuminance')) {
            reporting.unshift({
                endpointId: 1,
                cluster: SonoffCluster,
                attributeName: 'illuminance'
            });
        }
        this.configureAttributeReporting(reporting).catch(this.error);

        // Motion follows the occupancy bit, as in zigbee-herdsman-converters
        zclNode.endpoints[1].clusters[CLUSTER.OCCUPANCY_SENSING.NAME]
            .on('attr.occupancy', (value) => {
                this.setCapabilityValue('alarm_motion', value.occupied).catch(this.error);
            });

        // Only a dim/bright state, updated by the sensor when it detects someone
        if (this.hasCapability('sonoff_illuminance')) {
            zclNode.endpoints[1].clusters[SonoffCluster.NAME]
                .on('attr.illuminance', (value) => {
                    this.setCapabilityValue('sonoff_illuminance', value ? 'bright' : 'dim').catch(this.error);
                });
        }

        this.checkAttributes();
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        // Only what the user changed: the sensitivity has no default value to write otherwise
        const attributes = {};
        if (changedKeys.includes('occupied_to_unoccupied_delay')) {
            attributes.ultrasonicOccupiedToUnoccupiedDelay = newSettings.occupied_to_unoccupied_delay;
        }
        if (changedKeys.includes('occupied_threshold')) {
            attributes.ultrasonicUnoccupiedToOccupiedThreshold = Number(newSettings.occupied_threshold);
        }

        await this.writeAttributes(CLUSTER.OCCUPANCY_SENSING, attributes);
    }

    async checkAttributes() {
        this.readAttribute(CLUSTER.OCCUPANCY_SENSING, OCCUPANCY_ATTRIBUTES, (data) => {
            if (data.occupancy !== undefined) {
                this.setCapabilityValue('alarm_motion', data.occupancy.occupied).catch(this.error);
            }

            const settings = {};
            if (data.ultrasonicOccupiedToUnoccupiedDelay !== undefined) {
                settings.occupied_to_unoccupied_delay = data.ultrasonicOccupiedToUnoccupiedDelay;
            }
            if (data.ultrasonicUnoccupiedToOccupiedThreshold !== undefined) {
                settings.occupied_threshold = data.ultrasonicUnoccupiedToOccupiedThreshold.toString();
            }
            if (Object.keys(settings).length > 0) {
                this.setSettings(settings).catch(this.error);
            }
        });
    }

}

module.exports = OccupancySensor;
