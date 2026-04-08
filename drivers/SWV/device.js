'use strict';

const { CLUSTER } = require('zigbee-clusters');
const SonoffCluster = require('../../lib/SonoffCluster');
const SonoffBase = require('../sonoffbase');

class SonoffSWV extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        // Valve on/off control
        if (this.hasCapability('onoff')) {
            this.registerCapability('onoff', CLUSTER.ON_OFF);
        }

        // Configure attribute reporting
        this.configureAttributeReporting([
            {
                endpointId: 1,
                cluster: CLUSTER.ON_OFF,
                attributeName: 'onOff',
                minInterval: 1,
                maxInterval: 1800,
                minChange: 0
            }
        ]).catch(err => this.error('Failed to configure attribute reporting:', err));

        // Listen for valve abnormal state changes on SonoffCluster
        const sonoffCluster = zclNode.endpoints[1].clusters.SonoffCluster;
        if (sonoffCluster) {
            sonoffCluster.manufacturerId = 0x1286;

            sonoffCluster.on('attr.valve_abnormal_state', (value) => {
                this.log('Valve abnormal state changed:', value);
                this._updateAlarmState(value);
            });
        }

        this.checkAttributes();
    }

    _updateAlarmState(value) {
        // SWV: 0=normal, 1=water_shortage, 2=water_leakage, 3=both
        const hasLeak = (value & 0x02) !== 0;
        if (this.hasCapability('alarm_water')) {
            this.setCapabilityValue('alarm_water', hasLeak).catch(this.error);
        }
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.log('Settings changed:', changedKeys);

        // Auto-close valve on water shortage
        if (changedKeys.includes('lack_water_close_valve_timeout')) {
            try {
                const value = parseInt(newSettings.lack_water_close_valve_timeout, 10);
                await this.writeAttribute(SonoffCluster, 'lack_water_close_valve_timeout', value);
                this.log('lack_water_close_valve_timeout updated to', value);
            } catch (error) {
                this.error('Error updating lack_water_close_valve_timeout:', error);
                throw new Error(`Failed to update auto-close timeout: ${error.message}`);
            }
        }
    }

    async checkAttributes() {
        // Read valve abnormal state
        this.readAttribute(SonoffCluster, ['valve_abnormal_state', 'lack_water_close_valve_timeout'], (data) => {
            this.log('Read SonoffCluster attributes:', data);
            if (data.valve_abnormal_state !== undefined) {
                this._updateAlarmState(data.valve_abnormal_state);
            }
            if (data.lack_water_close_valve_timeout !== undefined) {
                this.setSettings({
                    lack_water_close_valve_timeout: String(data.lack_water_close_valve_timeout)
                }).catch(this.error);
            }
        });
    }

    async onDeleted() {
        this.log('SWV removed');
        const sonoffCluster = this.zclNode?.endpoints?.[1]?.clusters?.SonoffCluster;
        if (sonoffCluster) sonoffCluster.removeAllListeners('attr.valve_abnormal_state');
        await super.onDeleted();
    }
}

module.exports = SonoffSWV;
