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
        this._click = node.homey.flow.getDeviceTriggerCard(`SonoffMINIZB2GSL:toggle_l${channel}`);
    }
    toggle() {
        this.node.log(`Detach Mode: Channel ${this.channel} toggled`);
        this._click.trigger(this.node, {}, {}).catch(err => this.node.error('Failed to trigger:', err));
    }
}

class SonoffMINIZB2GSL extends SonoffBase {

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

        // Configure attribute reporting for both endpoints
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
            }
        ]).catch(err => this.error('Failed to configure attribute reporting:', err));

        // Bind detach relay toggle triggers for both channels
        zclNode.endpoints[1].bind(CLUSTER.ON_OFF.NAME, new DetachBoundCluster(this, 1));
        zclNode.endpoints[2].bind(CLUSTER.ON_OFF.NAME, new DetachBoundCluster(this, 2));

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
        for (const [key, ep] of [['power_on_behavior_l1', 1], ['power_on_behavior_l2', 2]]) {
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

        // External trigger mode per channel
        for (const [key, ep] of [['external_trigger_mode_l1', 1], ['external_trigger_mode_l2', 2]]) {
            if (changedKeys.includes(key)) {
                try {
                    const cluster = this.zclNode.endpoints[ep].clusters.SonoffCluster;
                    if (cluster) {
                        cluster.manufacturerId = 0x1286;
                        await cluster.writeAttributes({ external_trigger_mode: parseInt(newSettings[key], 10) });
                    }
                    this.log(`${key} updated`);
                } catch (error) {
                    this.error(`Error updating ${key}:`, error);
                    throw new Error(`Failed to update ${key}: ${error.message}`);
                }
            }
        }

        // Detach relay (bitmap)
        if (changedKeys.includes('detach_relay_1') || changedKeys.includes('detach_relay_2')) {
            try {
                let value = 0x00;
                if (newSettings.detach_relay_1) value |= 0x01;
                if (newSettings.detach_relay_2) value |= 0x02;
                await this.writeAttribute(SonoffCluster, 'detach_relay_mode2', value);
                this.log('Detach relay updated');
            } catch (error) {
                this.error('Error updating detach relay:', error);
                throw new Error(`Failed to update detach relay: ${error.message}`);
            }
        }

        // Delayed power-on state per channel
        for (const [key, ep] of [['delayed_power_on_state_l1', 1], ['delayed_power_on_state_l2', 2]]) {
            if (changedKeys.includes(key)) {
                try {
                    const cluster = this.zclNode.endpoints[ep].clusters.SonoffCluster;
                    if (cluster) {
                        cluster.manufacturerId = 0x1286;
                        await cluster.writeAttributes({ delayed_power_on_state: newSettings[key] });
                    }
                    this.log(`${key} updated`);
                } catch (error) {
                    this.error(`Error updating ${key}:`, error);
                    throw new Error(`Failed to update ${key}: ${error.message}`);
                }
            }
        }

        // Delayed power-on time per channel
        for (const [key, ep] of [['delayed_power_on_time_l1', 1], ['delayed_power_on_time_l2', 2]]) {
            if (changedKeys.includes(key)) {
                try {
                    const cluster = this.zclNode.endpoints[ep].clusters.SonoffCluster;
                    if (cluster) {
                        cluster.manufacturerId = 0x1286;
                        await cluster.writeAttributes({ delayed_power_on_time: newSettings[key] });
                    }
                    this.log(`${key} updated`);
                } catch (error) {
                    this.error(`Error updating ${key}:`, error);
                    throw new Error(`Failed to update ${key}: ${error.message}`);
                }
            }
        }
    }

    async checkAttributes() {
        // Read power-on behavior per endpoint
        for (const [key, ep] of [['power_on_behavior_l1', 1], ['power_on_behavior_l2', 2]]) {
            this.readAttribute({ NAME: 'onOff' }, ['powerOnBehavior'], (data) => {
                if (data && data.powerOnBehavior !== undefined) {
                    this.setSettings({ [key]: data.powerOnBehavior }).catch(this.error);
                }
            });
        }

        // Read SonoffCluster attributes from endpoint 1
        this.readAttribute(SonoffCluster, ['detach_relay_mode2'], (data) => {
            this.log('Read SonoffCluster attributes:', data);
            const settings = {};
            if (data.detach_relay_mode2 !== undefined) {
                settings.detach_relay_1 = (data.detach_relay_mode2 & 0x01) !== 0;
                settings.detach_relay_2 = (data.detach_relay_mode2 & 0x02) !== 0;
            }
            if (Object.keys(settings).length > 0) {
                this.setSettings(settings).catch(this.error);
            }
        });
    }

    async onDeleted() {
        this.log('MINI-ZB2GS-L removed');
        await super.onDeleted();
    }
}

module.exports = SonoffMINIZB2GSL;
