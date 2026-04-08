'use strict';

const { CLUSTER, BoundCluster } = require('zigbee-clusters');
const SonoffCluster = require('../../lib/SonoffCluster');
const SonoffBase = require('../sonoffbase');

// TurboMode constants
const TURBO_MODE_VALUES = { OFF: 9, ON: 20 };

// Inching protocol constants
const INCHING_PROTOCOL = {
    CMD: 0x01, SUBCMD_INCHING: 0x17, PAYLOAD_LENGTH: 0x07,
    SEQ_NUM: 0x80, FLAG_ENABLE: 0x80, FLAG_MODE_ON: 0x01
};

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

        // TurboMode
        if (changedKeys.includes('turbo_mode')) {
            try {
                const rawValue = newSettings.turbo_mode ? TURBO_MODE_VALUES.ON : TURBO_MODE_VALUES.OFF;
                await this.writeAttribute(SonoffCluster, 'turbo_mode', rawValue);
                this.log('TurboMode updated');
            } catch (error) {
                this.error('Error updating turbo_mode:', error);
                throw new Error(`Failed to update turbo mode: ${error.message}`);
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
                throw new Error(`Failed to update inching: ${error.message}`);
            }
        }
    }

    async setInching(enabled = false, time = 1, mode = 'on') {
        const msTime = Math.round(time * 1000);
        const rawTimeUnits = Math.round(msTime / 500);
        const tmpTime = Math.min(Math.max(rawTimeUnits, 1), 0xffff);

        const payloadValue = [];
        payloadValue[0] = INCHING_PROTOCOL.CMD;
        payloadValue[1] = INCHING_PROTOCOL.SUBCMD_INCHING;
        payloadValue[2] = INCHING_PROTOCOL.PAYLOAD_LENGTH;
        payloadValue[3] = INCHING_PROTOCOL.SEQ_NUM;
        payloadValue[4] = 0x00;
        if (enabled) payloadValue[4] |= INCHING_PROTOCOL.FLAG_ENABLE;
        if (mode === 'on') payloadValue[4] |= INCHING_PROTOCOL.FLAG_MODE_ON;
        payloadValue[5] = 0x00;
        payloadValue[6] = tmpTime & 0xff;
        payloadValue[7] = (tmpTime >> 8) & 0xff;
        payloadValue[8] = 0x00;
        payloadValue[9] = 0x00;

        const checksumLength = payloadValue[2] + 3;
        let checksum = 0x00;
        for (let i = 0; i < checksumLength; i++) checksum ^= payloadValue[i];
        payloadValue[10] = checksum;

        const cluster = this.zclNode.endpoints[1].clusters['SonoffCluster'];
        if (!cluster) throw new Error('SonoffCluster not available');

        await cluster.protocolData(
            { data: Buffer.from(payloadValue) },
            { disableDefaultResponse: true, waitForResponse: false, manufacturerSpecific: true, manufacturerId: 0x1286 }
        );
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
        this.readAttribute(SonoffCluster, ['turbo_mode', 'network_led', 'detach_relay_mode2'], (data) => {
            this.log('Read SonoffCluster attributes:', data);
            const settings = {};
            if (data.turbo_mode !== undefined) {
                settings.turbo_mode = data.turbo_mode === TURBO_MODE_VALUES.ON;
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
