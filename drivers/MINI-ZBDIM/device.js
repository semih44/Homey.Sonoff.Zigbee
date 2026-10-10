'use strict';

const { CLUSTER } = require('zigbee-clusters');
const SonoffCluster = require('../../lib/SonoffCluster');
const SonoffBase = require('../sonoffbase');

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
                this.log('Calibration status:', value);
                this.setSettings({ calibration_status: this._calibrationStatusText(value) })
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

        // Power-on behavior (standard OnOff cluster attribute)
        if (changedKeys.includes('power_on_behavior')) {
            await this.writePowerOnBehavior(newSettings.power_on_behavior);
        }

        // Delayed power-on state/time
        if (changedKeys.includes('delayed_power_on_state') || changedKeys.includes('delayed_power_on_time')) {
            try {
                const attrs = {};
                if (changedKeys.includes('delayed_power_on_state')) {
                    attrs.power_on_delay_state = newSettings.delayed_power_on_state;
                }
                if (changedKeys.includes('delayed_power_on_time')) {
                    attrs.power_on_delay_time = SonoffCluster.secondsToPowerOnDelay(newSettings.delayed_power_on_time);
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
                await this.writeAttribute(SonoffCluster, 'switch_mode', parseInt(newSettings.external_trigger_mode, 10));
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
                // Character data only: the CHAR_STR type adds the length byte (0x03) itself.
                // All bytes are below 0x80, so they survive the library's utf8 encoding unchanged.
                const actionBytes = {
                    'start': [0x01, 0x01, 0x01],
                    'stop': [0x01, 0x01, 0x02],
                    'clear': [0x01, 0x01, 0x03]
                };
                const bytes = actionBytes[newSettings.calibration_action];
                if (bytes) {
                    await this.writeAttribute(SonoffCluster, 'set_calibration_action', String.fromCharCode(...bytes));
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

    // zigbee-herdsman-converters: 0 uncalibrated, 1 calibrating, 2 calibration failed, 3 calibrated
    _calibrationStatusText(value) {
        return [0, 1, 2, 3].includes(value) ? this.homey.__(`calibration_status.${value}`) : String(value);
    }

    async checkAttributes() {
        // Read power-on behavior
        this.readPowerOnBehavior('power_on_behavior');

        // Read SonoffCluster attributes
        this.readAttribute(SonoffCluster, [
            'power_on_delay_state',
            'power_on_delay_time',
            'switch_mode',
            'min_brightness',
            'transition_time',
            'dimming_rate',
            'calibration_status'
        ], (data) => {
            this.log('Read SonoffCluster attributes:', data);
            const settings = {};

            if (data.power_on_delay_state !== undefined) {
                settings.delayed_power_on_state = data.power_on_delay_state;
            }
            if (data.power_on_delay_time !== undefined) {
                settings.delayed_power_on_time = SonoffCluster.powerOnDelayToSeconds(data.power_on_delay_time);
            }
            if (data.switch_mode !== undefined) {
                settings.external_trigger_mode = String(data.switch_mode);
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
                settings.calibration_status = this._calibrationStatusText(data.calibration_status);
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
