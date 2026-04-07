'use strict';

const { CLUSTER, BoundCluster } = require('zigbee-clusters');
const SonoffCluster = require('../../lib/SonoffCluster');
const SonoffBase = require('../sonoffbase');

/**
 * Bound OnOff cluster for detach relay mode.
 * When detach relay is enabled, physical switch sends toggle commands
 * without changing relay state — mapped to a Flow trigger.
 */
class DetachBoundCluster extends BoundCluster {
    constructor(node) {
        super();
        this.node = node;
        this._click = node.homey.flow.getDeviceTriggerCard('SonoffZBM51C80:click');
    }

    toggle() {
        this.node.log('Detach Mode: Physical switch toggled');
        this._click.trigger(this.node, {}, {}).catch(err => this.node.error('Failed to trigger click:', err));
    }
}

class SonoffZBM51C80 extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

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
                minChange: 1
            }
        ]).catch(err => this.error('Failed to configure attribute reporting:', err));

        // Bind toggle command for detach relay mode
        this.zclNode.endpoints[1].bind(CLUSTER.ON_OFF.NAME, new DetachBoundCluster(this));

        // Setup SonoffCluster
        const sonoffCluster = this.zclNode.endpoints[1].clusters.SonoffCluster;
        if (sonoffCluster) {
            sonoffCluster.manufacturerId = 0x1286;
        }

        this.checkAttributes();
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.log('Settings changed:', changedKeys);

        const onOffCluster = this.zclNode.endpoints[1].clusters.onOff;

        // Power-on behavior
        if (changedKeys.includes('power_on_behavior')) {
            try {
                await onOffCluster.writeAttributes({
                    powerOnBehavior: newSettings.power_on_behavior
                });
                this.log('Power-on behavior updated');
            } catch (error) {
                this.error('Error updating power_on_behavior:', error);
                throw new Error(`Failed to update power-on behavior: ${error.message}`);
            }
        }

        // Network LED
        if (changedKeys.includes('network_led')) {
            try {
                await this.writeAttribute(SonoffCluster, 'network_led', newSettings.network_led);
                this.log('Network LED updated');
            } catch (error) {
                this.error('Error updating network_led:', error);
                throw new Error(`Failed to update network LED: ${error.message}`);
            }
        }

        // Detach relay mode (bitmap: bit 0 = outlet 1)
        if (changedKeys.includes('detach_relay')) {
            try {
                const value = newSettings.detach_relay ? 0x01 : 0x00;
                await this.writeAttribute(SonoffCluster, 'detach_relay_mode2', value);
                this.log('Detach relay updated');
            } catch (error) {
                this.error('Error updating detach_relay:', error);
                throw new Error(`Failed to update detach relay: ${error.message}`);
            }
        }
    }

    async checkAttributes() {
        // Read power-on behavior
        this.readAttribute(CLUSTER.ON_OFF, ['powerOnBehavior'], (data) => {
            if (data && data.powerOnBehavior !== undefined) {
                this.setSettings({ power_on_behavior: data.powerOnBehavior })
                    .catch(err => this.error('Failed to set powerOnBehavior:', err));
            }
        });

        // Read SonoffCluster attributes
        this.readAttribute(SonoffCluster, ['network_led', 'detach_relay_mode2', 'device_work_mode'], (data) => {
            this.log('Read SonoffCluster attributes:', data);
            const settings = {};
            if (data.network_led !== undefined) settings.network_led = data.network_led;
            if (data.detach_relay_mode2 !== undefined) settings.detach_relay = (data.detach_relay_mode2 & 0x01) !== 0;
            if (Object.keys(settings).length > 0) {
                this.setSettings(settings).catch(err => this.error('Error setting attributes:', err));
            }
        });
    }

    async onDeleted() {
        this.log('ZBM5-1C-80/86 removed');
        await super.onDeleted();
    }
}

module.exports = SonoffZBM51C80;
