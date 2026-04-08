'use strict';

const { CLUSTER } = require('zigbee-clusters');
const SonoffCluster = require('../../lib/SonoffCluster');
const SonoffBase = require('../sonoffbase');

class SonoffSWVZFE extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        if (this.hasCapability('onoff')) {
            this.registerCapability('onoff', CLUSTER.ON_OFF);
        }

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
        const hasLeak = (value & 0x02) !== 0;
        if (this.hasCapability('alarm_water')) {
            this.setCapabilityValue('alarm_water', hasLeak).catch(this.error);
        }
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.log('Settings changed:', changedKeys);
        if (changedKeys.includes('child_lock')) {
            try {
                await this.writeAttribute(SonoffCluster, 'child_lock', newSettings.child_lock);
                this.log('Child lock updated');
            } catch (error) {
                this.error('Error updating child_lock:', error);
                throw new Error(`Failed to update child lock: ${error.message}`);
            }
        }
    }

    async checkAttributes() {
        this.readAttribute(SonoffCluster, ['valve_abnormal_state', 'child_lock'], (data) => {
            this.log('Read SonoffCluster attributes:', data);
            if (data.valve_abnormal_state !== undefined) this._updateAlarmState(data.valve_abnormal_state);
            if (data.child_lock !== undefined) this.setSettings({ child_lock: data.child_lock }).catch(this.error);
        });
    }

    async onDeleted() {
        this.log('SWV-ZFE removed');
        const sonoffCluster = this.zclNode?.endpoints?.[1]?.clusters?.SonoffCluster;
        if (sonoffCluster) sonoffCluster.removeAllListeners('attr.valve_abnormal_state');
        await super.onDeleted();
    }
}

module.exports = SonoffSWVZFE;
