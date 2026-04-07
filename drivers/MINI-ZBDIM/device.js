'use strict';

const { CLUSTER } = require('zigbee-clusters');
const SonoffCluster = require('../../lib/SonoffCluster');
const SonoffBase = require('../sonoffbase');

// Inching protocol constants (same as ZBMINIR2)
const INCHING_PROTOCOL = {
    CMD: 0x01,
    SUBCMD_INCHING: 0x17,
    PAYLOAD_LENGTH: 0x07,
    SEQ_NUM: 0x80,
    FLAG_ENABLE: 0x80,
    FLAG_MODE_ON: 0x01
};

class SonoffMINIZBDIM extends SonoffBase {

    _verifyTimeout = null;
    _powerReportInterval = null;

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        // Register on/off capability
        if (this.hasCapability('onoff')) {
            this.registerCapability('onoff', CLUSTER.ON_OFF);
        }

        // Register dim capability
        if (this.hasCapability('dim')) {
            this.registerCapability('dim', CLUSTER.LEVEL_CONTROL);
        }

        // Configure attribute reporting for on/off and level
        this.configureAttributeReporting([
            {
                endpointId: 1,
                cluster: CLUSTER.ON_OFF,
                attributeName: 'onOff',
                minInterval: 1,
                maxInterval: 3600,
                minChange: 1
            },
            {
                endpointId: 1,
                cluster: CLUSTER.LEVEL_CONTROL,
                attributeName: 'currentLevel',
                minInterval: 1,
                maxInterval: 3600,
                minChange: 1
            }
        ]).catch(err => this.error('Failed to configure attribute reporting:', err));

        // Setup SonoffCluster for manufacturer-specific features
        const sonoffCluster = this.zclNode.endpoints[1].clusters.SonoffCluster;
        if (sonoffCluster) {
            sonoffCluster.manufacturerId = 0x1286;

            // Listen for power metering attribute reports
            sonoffCluster.on('attr.ac_power', (value) => {
                const power = value / 1000;
                this.setCapabilityValue('measure_power', power).catch(this.error);
            });

            sonoffCluster.on('attr.ac_voltage', (value) => {
                const voltage = value / 1000;
                this.setCapabilityValue('measure_voltage', voltage).catch(this.error);
            });

            sonoffCluster.on('attr.ac_current', (value) => {
                const current = value / 1000;
                this.setCapabilityValue('measure_current', current).catch(this.error);
            });

            // Listen for calibration status/progress updates
            sonoffCluster.on('attr.calibration_status', (value) => {
                const statusMap = { 0: 'uncalibrated', 1: 'calibrating', 2: 'failed', 3: 'calibrated' };
                const status = statusMap[value] || 'unknown';
                this.log('Calibration status:', status);
                this.setSettings({ calibration_status: String(value) })
                    .catch(err => this.error('Failed to update calibration_status:', err));
            });

            sonoffCluster.on('attr.calibration_progress', (value) => {
                this.log('Calibration progress:', value, '%');
            });

            // Handle protocolDataResponse for inching
            sonoffCluster.on('protocolDataResponse', (payload) => {
                this.log('Received protocolDataResponse');
                if (payload && payload.data && Buffer.isBuffer(payload.data)) {
                    const buffer = payload.data;
                    const cmdType = buffer[0];
                    const status = buffer.length > 1 ? buffer[1] : null;
                    this.log(`  Command type: 0x${cmdType.toString(16)}, Status: 0x${status !== null ? status.toString(16) : 'N/A'}`);
                }
            });
        }

        // Read initial attributes
        this.checkAttributes();

        // Apply initial inching settings
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

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.log('Settings changed:', changedKeys);

        const onOffCluster = this.zclNode.endpoints[1].clusters.onOff;

        // Power-on behavior (standard OnOff cluster attribute)
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

        // Delayed power-on state/time
        if (changedKeys.includes('delayed_power_on_state') || changedKeys.includes('delayed_power_on_time')) {
            try {
                const attrs = {};
                if (changedKeys.includes('delayed_power_on_state')) {
                    attrs.delayed_power_on_state = newSettings.delayed_power_on_state;
                }
                if (changedKeys.includes('delayed_power_on_time')) {
                    // Scale: multiply by 2 (0.5s units)
                    attrs.delayed_power_on_time = Math.round(newSettings.delayed_power_on_time * 2);
                }
                await this.writeAttributes(SonoffCluster, attrs);
                this.log('Delayed power-on updated');
            } catch (error) {
                this.error('Error updating delayed power-on:', error);
                throw new Error(`Failed to update delayed power-on: ${error.message}`);
            }
        }

        // External trigger mode
        if (changedKeys.includes('external_trigger_mode')) {
            try {
                await this.writeAttribute(SonoffCluster, 'external_trigger_mode', parseInt(newSettings.external_trigger_mode, 10));
                this.log('External trigger mode updated');
            } catch (error) {
                this.error('Error updating external_trigger_mode:', error);
                throw new Error(`Failed to update external trigger mode: ${error.message}`);
            }
        }

        // Min brightness threshold
        if (changedKeys.includes('min_brightness')) {
            try {
                // Scale: multiply by 2.55 (% to 0-255)
                const rawValue = Math.round(newSettings.min_brightness * 2.55);
                await this.writeAttribute(SonoffCluster, 'min_brightness', rawValue);
                this.log('Min brightness updated');
            } catch (error) {
                this.error('Error updating min_brightness:', error);
                throw new Error(`Failed to update min brightness: ${error.message}`);
            }
        }

        // Transition time
        if (changedKeys.includes('transition_time')) {
            try {
                // Scale: multiply by 10 (0.1s units)
                const rawValue = Math.round(newSettings.transition_time * 10);
                await this.writeAttribute(SonoffCluster, 'transition_time', rawValue);
                this.log('Transition time updated');
            } catch (error) {
                this.error('Error updating transition_time:', error);
                throw new Error(`Failed to update transition time: ${error.message}`);
            }
        }

        // Dimming rate
        if (changedKeys.includes('dimming_rate')) {
            try {
                await this.writeAttribute(SonoffCluster, 'dimming_rate', parseInt(newSettings.dimming_rate, 10));
                this.log('Dimming rate updated');
            } catch (error) {
                this.error('Error updating dimming_rate:', error);
                throw new Error(`Failed to update dimming rate: ${error.message}`);
            }
        }

        // Calibration action
        if (changedKeys.includes('calibration_action')) {
            try {
                const actionMap = {
                    'start': Buffer.from([0x03, 0x01, 0x01, 0x01]),
                    'stop': Buffer.from([0x03, 0x01, 0x01, 0x02]),
                    'clear': Buffer.from([0x03, 0x01, 0x01, 0x03])
                };
                const payload = actionMap[newSettings.calibration_action];
                if (payload) {
                    await this.writeAttribute(SonoffCluster, 'set_calibration_action', payload.toString());
                    this.log('Calibration action sent:', newSettings.calibration_action);
                }
            } catch (error) {
                this.error('Error sending calibration action:', error);
                throw new Error(`Failed to send calibration action: ${error.message}`);
            }
        }

        // Inching settings
        const inchingKeys = ['inching_enabled', 'inching_mode', 'inching_time'];
        if (changedKeys.some(key => inchingKeys.includes(key))) {
            try {
                await this.setInching(
                    newSettings.inching_enabled,
                    newSettings.inching_time,
                    newSettings.inching_mode
                );
                this.log('Inching settings updated');
            } catch (error) {
                this.error('Error updating inching settings:', error);
                throw new Error(`Failed to update inching settings: ${error.message}`);
            }
        }
    }

    /**
     * Set inching (auto-off/on) configuration via protocolData command
     */
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

        // XOR checksum
        const checksumLength = payloadValue[2] + 3;
        let checksum = 0x00;
        for (let i = 0; i < checksumLength; i++) {
            checksum ^= payloadValue[i];
        }
        payloadValue[10] = checksum;

        this.log('Sending inching command:', { enabled, mode, time });

        const cluster = this.zclNode.endpoints[1].clusters['SonoffCluster'];
        if (!cluster) throw new Error('SonoffCluster not available');

        await cluster.protocolData(
            { data: Buffer.from(payloadValue) },
            {
                disableDefaultResponse: true,
                waitForResponse: false,
                manufacturerSpecific: true,
                manufacturerId: 0x1286
            }
        );
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
        this.readAttribute(SonoffCluster, [
            'delayed_power_on_state',
            'delayed_power_on_time',
            'external_trigger_mode',
            'min_brightness',
            'transition_time',
            'dimming_rate',
            'calibration_status'
        ], (data) => {
            this.log('Read SonoffCluster attributes:', data);
            const settings = {};

            if (data.delayed_power_on_state !== undefined) {
                settings.delayed_power_on_state = data.delayed_power_on_state;
            }
            if (data.delayed_power_on_time !== undefined) {
                settings.delayed_power_on_time = data.delayed_power_on_time / 2;
            }
            if (data.external_trigger_mode !== undefined) {
                settings.external_trigger_mode = String(data.external_trigger_mode);
            }
            if (data.min_brightness !== undefined) {
                settings.min_brightness = Math.round(data.min_brightness / 2.55);
            }
            if (data.transition_time !== undefined) {
                settings.transition_time = data.transition_time / 10;
            }
            if (data.dimming_rate !== undefined) {
                settings.dimming_rate = String(data.dimming_rate);
            }
            if (data.calibration_status !== undefined) {
                settings.calibration_status = String(data.calibration_status);
            }

            if (Object.keys(settings).length > 0) {
                this.setSettings(settings)
                    .then(() => this.log('Device settings initialized'))
                    .catch(err => this.error('Error initializing settings:', err));
            }
        });

        // Read power metering values
        this.readAttribute(SonoffCluster, ['ac_power', 'ac_voltage', 'ac_current'], (data) => {
            if (data.ac_power !== undefined) {
                this.setCapabilityValue('measure_power', data.ac_power / 1000).catch(this.error);
            }
            if (data.ac_voltage !== undefined) {
                this.setCapabilityValue('measure_voltage', data.ac_voltage / 1000).catch(this.error);
            }
            if (data.ac_current !== undefined) {
                this.setCapabilityValue('measure_current', data.ac_current / 1000).catch(this.error);
            }
        });
    }

    async onDeleted() {
        this.log('MINI-ZBDIM removed');

        const sonoffCluster = this.zclNode?.endpoints?.[1]?.clusters?.SonoffCluster;
        if (sonoffCluster) {
            sonoffCluster.removeAllListeners('protocolDataResponse');
            sonoffCluster.removeAllListeners('attr.ac_power');
            sonoffCluster.removeAllListeners('attr.ac_voltage');
            sonoffCluster.removeAllListeners('attr.ac_current');
            sonoffCluster.removeAllListeners('attr.calibration_status');
            sonoffCluster.removeAllListeners('attr.calibration_progress');
        }

        if (this._verifyTimeout) {
            clearTimeout(this._verifyTimeout);
            this._verifyTimeout = null;
        }

        await super.onDeleted();
    }
}

module.exports = SonoffMINIZBDIM;
