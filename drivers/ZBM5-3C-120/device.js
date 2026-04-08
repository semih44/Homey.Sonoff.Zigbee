'use strict';

const { CLUSTER, BoundCluster } = require('zigbee-clusters');
const SonoffCluster = require('../../lib/SonoffCluster');
const SonoffBase = require('../sonoffbase');

/**
 * Bound OnOff cluster for detach relay toggle events
 */
class DetachBoundCluster extends BoundCluster {
    constructor(node, channel) {
        super();
        this.node = node;
        this.channel = channel;
        this._click = node.homey.flow.getDeviceTriggerCard(`SonoffZBM53C120:toggle_l${channel}`);
    }
    toggle() {
        this.node.log(`Detach Mode: Channel ${this.channel} toggled`);
        this._click.trigger(this.node, {}, {}).catch(err => this.node.error('Failed to trigger:', err));
    }
}

class SonoffZBM53C120 extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        // Channel 1 — default onoff on endpoint 1
        if (this.hasCapability('onoff')) {
            this.registerCapability('onoff', CLUSTER.ON_OFF, { endpoint: 1 });
        }

        // Channel 2 — onoff.channel_2 on endpoint 2
        if (this.hasCapability('onoff.channel_2')) {
            this.registerCapability('onoff.channel_2', CLUSTER.ON_OFF, { endpoint: 2 });
        }

        // Channel 3 — onoff.channel_3 on endpoint 3
        if (this.hasCapability('onoff.channel_3')) {
            this.registerCapability('onoff.channel_3', CLUSTER.ON_OFF, { endpoint: 3 });
        }

        // Configure attribute reporting for all three endpoints
        this.configureAttributeReporting([
            {
                endpointId: 1,
                cluster: CLUSTER.ON_OFF,
                attributeName: 'onOff',
                minInterval: 1,
                maxInterval: 1800,
                minChange: 1
            },
            {
                endpointId: 2,
                cluster: CLUSTER.ON_OFF,
                attributeName: 'onOff',
                minInterval: 1,
                maxInterval: 1800,
                minChange: 1
            },
            {
                endpointId: 3,
                cluster: CLUSTER.ON_OFF,
                attributeName: 'onOff',
                minInterval: 1,
                maxInterval: 1800,
                minChange: 1
            }
        ]).catch(err => this.error('Failed to configure attribute reporting:', err));

        // Bind detach relay toggle triggers for all three channels
        zclNode.endpoints[1].bind(CLUSTER.ON_OFF.NAME, new DetachBoundCluster(this, 1));
        zclNode.endpoints[2].bind(CLUSTER.ON_OFF.NAME, new DetachBoundCluster(this, 2));
        zclNode.endpoints[3].bind(CLUSTER.ON_OFF.NAME, new DetachBoundCluster(this, 3));

        // Setup SonoffCluster
        const sonoffCluster = zclNode.endpoints[1].clusters.SonoffCluster;
        if (sonoffCluster) {
            sonoffCluster.manufacturerId = 0x1286;
        }

        this.checkAttributes();
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.log('Settings changed:', changedKeys);

        // Power-on behavior per channel
        for (const [key, ep] of [['power_on_behavior_l1', 1], ['power_on_behavior_l2', 2], ['power_on_behavior_l3', 3]]) {
            if (changedKeys.includes(key)) {
                try {
                    await this.zclNode.endpoints[ep].clusters.onOff.writeAttributes({
                        powerOnBehavior: newSettings[key]
                    });
                    this.log(`${key} updated`);
                } catch (error) {
                    this.error(`Error updating ${key}:`, error);
                    throw new Error(`Failed to update ${key}: ${error.message}`);
                }
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

        // Detach relay (bitmap: bit 0=ch1, bit 1=ch2, bit 2=ch3)
        if (changedKeys.includes('detach_relay_1') || changedKeys.includes('detach_relay_2') || changedKeys.includes('detach_relay_3')) {
            try {
                let value = 0x00;
                if (newSettings.detach_relay_1) value |= 0x01;
                if (newSettings.detach_relay_2) value |= 0x02;
                if (newSettings.detach_relay_3) value |= 0x04;
                await this.writeAttribute(SonoffCluster, 'detach_relay_mode2', value);
                this.log('Detach relay updated');
            } catch (error) {
                this.error('Error updating detach relay:', error);
                throw new Error(`Failed to update detach relay: ${error.message}`);
            }
        }
    }

    async checkAttributes() {
        // Read power-on behavior per endpoint
        for (const [key, ep] of [['power_on_behavior_l1', 1], ['power_on_behavior_l2', 2], ['power_on_behavior_l3', 3]]) {
            this.readAttribute({ NAME: 'onOff' }, ['powerOnBehavior'], (data) => {
                if (data && data.powerOnBehavior !== undefined) {
                    this.setSettings({ [key]: data.powerOnBehavior }).catch(this.error);
                }
            });
        }

        // Read SonoffCluster attributes from endpoint 1
        this.readAttribute(SonoffCluster, ['network_led', 'detach_relay_mode2'], (data) => {
            this.log('Read SonoffCluster attributes:', data);
            const settings = {};
            if (data.network_led !== undefined) settings.network_led = data.network_led;
            if (data.detach_relay_mode2 !== undefined) {
                settings.detach_relay_1 = (data.detach_relay_mode2 & 0x01) !== 0;
                settings.detach_relay_2 = (data.detach_relay_mode2 & 0x02) !== 0;
                settings.detach_relay_3 = (data.detach_relay_mode2 & 0x04) !== 0;
            }
            if (Object.keys(settings).length > 0) {
                this.setSettings(settings).catch(this.error);
            }
        });
    }

    async onDeleted() {
        this.log('ZBM5-3C-120 removed');
        await super.onDeleted();
    }
}

module.exports = SonoffZBM53C120;
