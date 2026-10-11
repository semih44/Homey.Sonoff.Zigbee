'use strict';

const { CLUSTER } = require('zigbee-clusters');
const SonoffBase = require('../sonoffbase');
const SonoffCluster = require('../../lib/SonoffCluster');

// Zone 1 (0-1 m) is the first two 0.5 m zones of the sensor, zones 2 to 7 (up to 4 m) are bits 2 to 7
// (zigbee-herdsman-converters occupancyZoneEnable(8, 0.5, true))
const ZONE_BITS = [0b11, 1 << 2, 1 << 3, 1 << 4, 1 << 5, 1 << 6, 1 << 7];
const ZONE_SETTINGS = ZONE_BITS.map((bits, index) => `occupancy_zone_${index + 1}`);

// SONOFF SenseGuard Presence Core (zigbee-herdsman-converters SNZB-06P24): 24 GHz radar presence and
// illuminance in lux
class SonoffSNZB06P24 extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        // zigbee-clusters reports occupancy as a bitmap; the default parser of homey-zigbeedriver compares it with 1
        this.registerCapability('alarm_motion', CLUSTER.OCCUPANCY_SENSING, {
            reportParser: value => value.occupied,
        });
        this.registerCapability('measure_luminance', CLUSTER.ILLUMINANCE_MEASUREMENT);

        this.registerCapabilityListener('button.spatial_learning', () => this.startSpatialLearning());
        zclNode.endpoints[1].clusters[SonoffCluster.NAME]
            .on('spatialLearningResponse', ({ data }) => this.showSpatialLearning(data));

        this.checkAttributes();
    }

    // zigbee-herdsman-converters spatialLearning: sub-command 0, then the time as uint64 in ms. The sensor
    // answers with its own command instead of a default response, see showSpatialLearning.
    async startSpatialLearning() {
        const data = Buffer.alloc(9);
        data.writeBigUInt64LE(BigInt(Date.now()), 1);
        await this.zclNode.endpoints[1].clusters[SonoffCluster.NAME].spatialLearning({ data }, { waitForResponse: false });
    }

    // Sub-command 1 with the sequence and the expected end when the learning starts, 2 with the sequence,
    // state and reason when it ends: both 0 when it succeeded
    showSpatialLearning(data) {
        let status;
        if (data[0] === 0x01 && data.length >= 17) status = 'learning';
        if (data[0] === 0x02 && data.length >= 11) status = data[9] === 0 && data[10] === 0 ? 'completed' : 'failed';
        if (status) {
            this.setSettings({ spatial_learning_status: this.homey.__(`spatial_learning.${status}`) }).catch(this.error);
        }
    }

    async onSettings({ newSettings, changedKeys }) {
        if (changedKeys.includes('occupied_to_unoccupied_delay')) {
            await this.writeAttributes(CLUSTER.OCCUPANCY_SENSING, {
                pirOccupiedToUnoccupiedDelay: newSettings.occupied_to_unoccupied_delay
            });
        }

        const attributes = {};
        if (changedKeys.includes('illuminance_calibration')) {
            attributes.illumination_compensation_offset = newSettings.illuminance_calibration;
        }
        if (changedKeys.includes('radar_sensitivity')) {
            attributes.radar_sensitivity = newSettings.radar_sensitivity;
        }
        if (changedKeys.some(key => ZONE_SETTINGS.includes(key))) {
            attributes.occupancy_zone_enable = ZONE_BITS
                .reduce((bitmap, bits, index) => (newSettings[ZONE_SETTINGS[index]] ? bitmap | bits : bitmap), 0);
        }
        await this.writeAttributes(SonoffCluster, attributes);
    }

    async checkAttributes() {
        this.readAttribute(CLUSTER.OCCUPANCY_SENSING, ['pirOccupiedToUnoccupiedDelay'], (data) => {
            if (data.pirOccupiedToUnoccupiedDelay !== undefined) {
                this.setSettings({ occupied_to_unoccupied_delay: data.pirOccupiedToUnoccupiedDelay }).catch(this.error);
            }
        });
        this.readAttribute(SonoffCluster, ['illumination_compensation_offset', 'radar_sensitivity', 'occupancy_zone_enable'], (data) => {
            const settings = {};
            if (data.illumination_compensation_offset !== undefined) {
                settings.illuminance_calibration = data.illumination_compensation_offset;
            }
            if (data.radar_sensitivity !== undefined) settings.radar_sensitivity = data.radar_sensitivity;
            // Like zigbee-herdsman-converters, which ignores an empty bitmap
            if (data.occupancy_zone_enable) {
                ZONE_BITS.forEach((bits, index) => {
                    settings[ZONE_SETTINGS[index]] = (data.occupancy_zone_enable & bits) !== 0;
                });
            }
            if (Object.keys(settings).length > 0) this.setSettings(settings).catch(this.error);
        });
    }

}

module.exports = SonoffSNZB06P24;
