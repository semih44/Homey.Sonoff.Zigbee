'use strict';

const { CLUSTER } = require('zigbee-clusters');
const SonoffCluster = require('../../lib/SonoffCluster');
const SonoffBase = require('../sonoffbase');

// TurboMode constants
const TURBO_MODE_VALUES = {
    OFF: 9,
    ON: 20
};

// Inching protocol constants
const INCHING_PROTOCOL = {
    CMD: 0x01,
    SUBCMD_INCHING: 0x17,
    PAYLOAD_LENGTH: 0x07,
    SEQ_NUM: 0x80,
    FLAG_ENABLE: 0x80,
    FLAG_MODE_ON: 0x01
};

class SonoffZBMicro extends SonoffBase {

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
                maxInterval: 3600,
                minChange: 1
            }
        ]).catch(err => this.error('Failed to configure attribute reporting:', err));

        const sonoffCluster = this.zclNode.endpoints[1].clusters.SonoffCluster;
        if (sonoffCluster) {
            sonoffCluster.manufacturerId = 0x1286;

            sonoffCluster.on('protocolDataResponse', (payload) => {
                this.log('ZBMicro: Received protocolDataResponse');
                if (payload && payload.data && Buffer.isBuffer(payload.data)) {
                    const buffer = payload.data;
                    const cmdType = buffer[0];
                    const status = buffer.length > 1 ? buffer[1] : null;
                    this.log(`  Command type: 0x${cmdType.toString(16)}, Status: 0x${status !== null ? status.toString(16) : 'N/A'}`);
                }
            });
        }

        this.checkAttributes();

        const settings = this.getSettings();
        if (settings && settings.inching_enabled !== undefined) {
            try {
                await this.setInching(
                    settings.inching_enabled,
                    settings.inching_time || 1,
                    settings.inching_mode || 'on'
                );
            } catch (error) {
                this.error('Failed to apply initial inching settings:', error);
            }
        }
    }

    _parseTurboMode(rawValue) {
        return rawValue === TURBO_MODE_VALUES.ON || rawValue === true || rawValue === 1;
    }

    _formatTurboMode(enabled) {
        return enabled ? TURBO_MODE_VALUES.ON : TURBO_MODE_VALUES.OFF;
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.log('Settings changed:', changedKeys);

        const onOffCluster = this.zclNode.endpoints[1].clusters.onOff;

        if (changedKeys.includes('power_on_behavior')) {
            await onOffCluster.writeAttributes({ powerOnBehavior: newSettings.power_on_behavior });
        }

        if (changedKeys.includes('turbo_mode')) {
            const rawValue = this._formatTurboMode(newSettings.turbo_mode);
            await this.writeAttribute(SonoffCluster, 'turbo_mode', rawValue);
        }

        const otherKeys = changedKeys.filter(key =>
            ['network_led'].includes(key)
        );
        if (otherKeys.length > 0) {
            await this.writeAttributes(SonoffCluster, newSettings, otherKeys);
        }

        const inchingKeys = ['inching_enabled', 'inching_mode', 'inching_time'];
        if (changedKeys.some(key => inchingKeys.includes(key))) {
            await this.setInching(
                newSettings.inching_enabled,
                newSettings.inching_time,
                newSettings.inching_mode
            );
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

        this.log('Sending inching command:', { enabled, mode, time_seconds: time });

        const cluster = this.zclNode.endpoints[1].clusters['SonoffCluster'];
        if (!cluster) throw new Error('SonoffCluster not available');

        await cluster.protocolData(
            { data: Buffer.from(payloadValue) },
            { disableDefaultResponse: true, waitForResponse: false, manufacturerSpecific: true, manufacturerId: 0x1286 }
        );
    }

    async checkAttributes() {
        this.readAttribute(CLUSTER.ON_OFF, ['powerOnBehavior'], (data) => {
            if (data && data.powerOnBehavior !== undefined) {
                this.setSettings({ power_on_behavior: data.powerOnBehavior }).catch(this.error);
            }
        });

        this.readAttribute(SonoffCluster, ['turbo_mode', 'network_led'], (data) => {
            const settingsData = { ...data };
            if (settingsData.turbo_mode !== undefined) {
                settingsData.turbo_mode = this._parseTurboMode(settingsData.turbo_mode);
            }
            this.setSettings(settingsData).catch(this.error);
        });
    }

    async onDeleted() {
        this.log('ZBMicro removed');
        const sonoffCluster = this.zclNode?.endpoints?.[1]?.clusters?.SonoffCluster;
        if (sonoffCluster) sonoffCluster.removeAllListeners('protocolDataResponse');
        await super.onDeleted();
    }
}

module.exports = SonoffZBMicro;
