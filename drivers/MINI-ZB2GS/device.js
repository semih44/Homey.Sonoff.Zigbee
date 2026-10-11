'use strict';

const { CLUSTER, BoundCluster } = require('zigbee-clusters');
const SonoffCluster = require('../../lib/SonoffCluster');
const { channelOnOff, triggerChannelChanges } = require('../../lib/Channels');
const SonoffBase = require('../sonoffbase');

/**
 * Bound OnOff cluster for detach relay toggle events
 */
class DetachBoundCluster extends BoundCluster {
    constructor(node, channel) {
        super();
        this.node = node;
        this.channel = channel;
        this._click = node.homey.flow.getDeviceTriggerCard(`SonoffMINIZB2GS:toggle_l${channel}`);
    }
    toggle() {
        this.node.log(`Detach Mode: Channel ${this.channel} toggled`);
        this._click.trigger(this.node, {}, {}).catch(err => this.node.error('Failed to trigger:', err));
    }
}

class SonoffMINIZB2GS extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        // Channel 1 — default onoff on endpoint 1
        if (this.hasCapability('onoff')) {
            this.registerCapability('onoff', CLUSTER.ON_OFF, { endpoint: 1 });
        }

        // Channel 2 — onoff.channel_2 on endpoint 2
        if (this.hasCapability('onoff.channel_2')) {
            this.registerCapability('onoff.channel_2', CLUSTER.ON_OFF, channelOnOff(2));
        }

        // Flow cards per channel, which Homey does not create for sub-capabilities
        triggerChannelChanges(this, zclNode, 2);

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

            sonoffCluster.on('protocolDataResponse', (payload) => {
                this.log('Received protocolDataResponse');
                if (payload && payload.data && Buffer.isBuffer(payload.data)) {
                    const cmdType = payload.data[0];
                    const status = payload.data.length > 1 ? payload.data[1] : null;
                    this.log(`  Command: 0x${cmdType.toString(16)}, Status: 0x${status !== null ? status.toString(16) : 'N/A'}`);
                }
            });
        }

        this.checkAttributes();
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.log('Settings changed:', changedKeys);

        // Power-on behavior per channel
        for (const [key, ep] of [['power_on_behavior_l1', 1], ['power_on_behavior_l2', 2]]) {
            if (changedKeys.includes(key)) {
                await this.writePowerOnBehavior(newSettings[key], ep);
            }
        }

        // External trigger mode per channel
        for (const [key, ep] of [['external_trigger_mode_l1', 1], ['external_trigger_mode_l2', 2]]) {
            if (changedKeys.includes(key)) {
                try {
                    const cluster = this.zclNode.endpoints[ep].clusters.SonoffCluster;
                    if (cluster) {
                        cluster.manufacturerId = 0x1286;
                        await cluster.writeAttributes({ switch_mode: parseInt(newSettings[key], 10) });
                    }
                    this.log(`${key} updated`);
                } catch (error) {
                    this.error(`Error updating ${key}:`, error);
                    throw error;
                }
            }
        }

        // TurboMode
        if (changedKeys.includes('turbo_mode')) {
            try {
                const rawValue = SonoffCluster.turboModeToRadioPower(newSettings.turbo_mode);
                await this.writeAttribute(SonoffCluster, 'turbo_mode', rawValue);
                this.log('TurboMode updated');
            } catch (error) {
                this.error('Error updating turbo_mode:', error);
                throw error;
            }
        }

        // Network LED
        if (changedKeys.includes('network_led')) {
            try {
                await this.writeAttribute(SonoffCluster, 'network_led', newSettings.network_led);
                this.log('Network LED updated');
            } catch (error) {
                this.error('Error updating network_led:', error);
                throw error;
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
                throw error;
            }
        }

        // Delayed power-on state per channel
        for (const [key, ep] of [['delayed_power_on_state_l1', 1], ['delayed_power_on_state_l2', 2]]) {
            if (changedKeys.includes(key)) {
                try {
                    const cluster = this.zclNode.endpoints[ep].clusters.SonoffCluster;
                    if (cluster) {
                        cluster.manufacturerId = 0x1286;
                        await cluster.writeAttributes({ power_on_delay_state: newSettings[key] });
                    }
                    this.log(`${key} updated`);
                } catch (error) {
                    this.error(`Error updating ${key}:`, error);
                    throw error;
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
                        await cluster.writeAttributes({ power_on_delay_time: SonoffCluster.secondsToPowerOnDelay(newSettings[key]) });
                    }
                    this.log(`${key} updated`);
                } catch (error) {
                    this.error(`Error updating ${key}:`, error);
                    throw error;
                }
            }
        }

        // Inching
        const inchingKeys = ['inching_enabled', 'inching_mode', 'inching_time'];
        if (changedKeys.some(key => inchingKeys.includes(key))) {
            try {
                await this.setInching(
                    newSettings.inching_enabled,
                    newSettings.inching_time,
                    newSettings.inching_mode
                );
                this.log('Inching updated');
            } catch (error) {
                this.error('Error updating inching:', error);
                throw error;
            }
        }

        // Inching channel 2 (zigbee-herdsman-converters: endpoint 2, channel byte 1)
        const inchingKeysL2 = ['inching_enabled_l2', 'inching_mode_l2', 'inching_time_l2'];
        if (changedKeys.some(key => inchingKeysL2.includes(key))) {
            try {
                await this.setInching(
                    newSettings.inching_enabled_l2,
                    newSettings.inching_time_l2,
                    newSettings.inching_mode_l2,
                    2
                );
                this.log('Inching channel 2 updated');
            } catch (error) {
                this.error('Error updating inching channel 2:', error);
                throw error;
            }
        }
    }

    async checkAttributes() {
        // Read power-on behavior per endpoint
        for (const [key, ep] of [['power_on_behavior_l1', 1], ['power_on_behavior_l2', 2]]) {
            this.readPowerOnBehavior(key, ep);
        }

        // Read delayed power-on per endpoint
        for (const [channel, ep] of [['l1', 1], ['l2', 2]]) {
            this.readPowerOnDelay(ep, `delayed_power_on_state_${channel}`, `delayed_power_on_time_${channel}`);
        }

        // Read the external trigger mode per endpoint
        for (const [key, ep] of [['external_trigger_mode_l1', 1], ['external_trigger_mode_l2', 2]]) {
            this.readSwitchMode(ep, key);
        }

        // Read SonoffCluster attributes from endpoint 1
        this.readAttribute(SonoffCluster, ['turbo_mode', 'network_led', 'detach_relay_mode2'], (data) => {
            this.log('Read SonoffCluster attributes:', data);
            const settings = {};
            if (data.turbo_mode !== undefined) {
                settings.turbo_mode = SonoffCluster.radioPowerToTurboMode(data.turbo_mode);
            }
            if (data.network_led !== undefined) settings.network_led = data.network_led;
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
        this.log('MINI-ZB2GS removed');
        const sonoffCluster = this.zclNode?.endpoints?.[1]?.clusters?.SonoffCluster;
        if (sonoffCluster) sonoffCluster.removeAllListeners('protocolDataResponse');
        await super.onDeleted();
    }
}

module.exports = SonoffMINIZB2GS;
