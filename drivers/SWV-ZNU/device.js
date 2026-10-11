'use strict';

const { CLUSTER } = require('zigbee-clusters');
const SonoffCluster = require('../../lib/SonoffCluster');
const SonoffBase = require('../sonoffbase');

class SonoffSWVZNU extends SonoffBase {

    async onNodeInit({ zclNode }) {
        // Migration: older versions offered a water alarm; without a flow meter the valve
        // detects neither leaks nor water shortage (zigbee-herdsman-converters)
        if (this.hasCapability('alarm_water') === true) {
            await this.removeCapability('alarm_water');
        }

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

        this.checkAttributes();
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.log('Settings changed:', changedKeys);

        // Child lock
        if (changedKeys.includes('child_lock')) {
            try {
                await this.writeAttribute(SonoffCluster, 'child_lock', newSettings.child_lock);
                this.log('Child lock updated');
            } catch (error) {
                this.error('Error updating child_lock:', error);
                throw error;
            }
        }
    }

    async checkAttributes() {
        this.readAttribute(SonoffCluster, ['child_lock'], (data) => {
            this.log('Read SonoffCluster attributes:', data);
            if (data.child_lock !== undefined) {
                this.setSettings({ child_lock: data.child_lock }).catch(this.error);
            }
        });
    }

}

module.exports = SonoffSWVZNU;
