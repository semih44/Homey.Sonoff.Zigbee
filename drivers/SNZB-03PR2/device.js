'use strict';

const { CLUSTER } = require('zigbee-clusters');
const SonoffBase = require('../sonoffbase');
const SonoffCluster = require('../../lib/SonoffCluster');

// SONOFF SenseGuard Motion Gen2 (zigbee-herdsman-converters SNZB-03PR2): PIR motion and illuminance in lux
class SonoffSNZB03PR2 extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        // zigbee-clusters reports occupancy as a bitmap; the default parser of homey-zigbeedriver compares it with 1
        this.registerCapability('alarm_motion', CLUSTER.OCCUPANCY_SENSING, {
            reportParser: value => value.occupied,
        });
        this.registerCapability('measure_luminance', CLUSTER.ILLUMINANCE_MEASUREMENT);

        this.checkAttributes();
    }

    async onSettings({ newSettings, changedKeys }) {
        if (changedKeys.includes('occupied_to_unoccupied_delay')) {
            await this.writeAttributes(CLUSTER.OCCUPANCY_SENSING, {
                pirOccupiedToUnoccupiedDelay: newSettings.occupied_to_unoccupied_delay
            });
        }
        if (changedKeys.includes('illuminance_calibration')) {
            await this.writeAttributes(SonoffCluster, {
                illumination_compensation_offset: newSettings.illuminance_calibration
            });
        }
    }

    async checkAttributes() {
        this.readAttribute(CLUSTER.OCCUPANCY_SENSING, ['pirOccupiedToUnoccupiedDelay'], (data) => {
            if (data.pirOccupiedToUnoccupiedDelay !== undefined) {
                this.setSettings({ occupied_to_unoccupied_delay: data.pirOccupiedToUnoccupiedDelay }).catch(this.error);
            }
        });
        this.readAttribute(SonoffCluster, ['illumination_compensation_offset'], (data) => {
            if (data.illumination_compensation_offset !== undefined) {
                this.setSettings({ illuminance_calibration: data.illumination_compensation_offset }).catch(this.error);
            }
        });
    }

}

module.exports = SonoffSNZB03PR2;
