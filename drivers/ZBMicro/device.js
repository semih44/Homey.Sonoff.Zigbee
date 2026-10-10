'use strict';

const { CLUSTER } = require('zigbee-clusters');
const SonoffCluster = require('../../lib/SonoffCluster');
const SonoffBase = require('../sonoffbase');

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
        // Only after pairing: the device keeps its inching configuration, later changes come from onSettings
        if (this.isFirstInit() && settings && settings.inching_enabled !== undefined) {
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

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.log('Settings changed:', changedKeys);

        if (changedKeys.includes('power_on_behavior')) {
            await this.writePowerOnBehavior(newSettings.power_on_behavior);
        }

        if (changedKeys.includes('turbo_mode')) {
            // ZBMicro takes the radio power only as a manufacturer-specific attribute
            const radioPower = SonoffCluster.turboModeToRadioPower(newSettings.turbo_mode);
            await this.zclNode.endpoints[1].clusters.SonoffCluster
                .withManufacturerCode(cluster => cluster.writeAttributes({ turbo_mode: radioPower }));
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

    async checkAttributes() {
        this.readPowerOnBehavior('power_on_behavior');

        this._readTurboMode();

        this.readAttribute(SonoffCluster, ['network_led'], (data) => {
            this.setSettings(data).catch(this.error);
        });
    }

    async _readTurboMode() {
        try {
            const { turbo_mode: radioPower } = await this.zclNode.endpoints[1].clusters.SonoffCluster
                .withManufacturerCode(cluster => cluster.readAttributes('turbo_mode'));
            if (radioPower !== undefined) {
                await this.setSettings({ turbo_mode: SonoffCluster.radioPowerToTurboMode(radioPower) });
            }
        } catch (error) {
            this.error('Could not read turbo mode:', error);
        }
    }

    async onDeleted() {
        this.log('ZBMicro removed');
        const sonoffCluster = this.zclNode?.endpoints?.[1]?.clusters?.SonoffCluster;
        if (sonoffCluster) sonoffCluster.removeAllListeners('protocolDataResponse');
        await super.onDeleted();
    }
}

module.exports = SonoffZBMicro;
