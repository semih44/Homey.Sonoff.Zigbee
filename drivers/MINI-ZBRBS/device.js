'use strict';

const SonoffBase = require('../sonoffbase');
const { CLUSTER } = require('zigbee-clusters');
const SonoffCluster = require('../../lib/SonoffCluster');

class SonoffMINIZBRBS extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        this.registerCapability('windowcoverings_state', CLUSTER.WINDOW_COVERING);

        this.registerCapability('windowcoverings_set', CLUSTER.WINDOW_COVERING, {
            set: 'goToLiftPercentage',
            report: 'currentPositionLiftPercentage',
            setParser(value) {
                return { percentageLiftValue: Math.round(value * 100) };
            },
            reportParser(value) {
                return value / 100;
            }
        });

        this.checkAttributes();
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        // Handle switch_mode: convert string to uint8
        if (changedKeys.includes('switch_mode')) {
            await this.writeAttribute(SonoffCluster, 'switch_mode', parseInt(newSettings.switch_mode, 10));
        }

        // Handle calibration action: write and reset dropdown to "No action"
        if (changedKeys.includes('motor_calibration_action')) {
            const action = parseInt(newSettings.motor_calibration_action, 10);
            if (action !== 0) {
                await this.writeAttribute(SonoffCluster, 'motor_calibration_action', action);
                this.log(`Motor calibration action sent: ${action}`);
                // Reset dropdown back to "No action" and re-read status after delay
                setTimeout(() => {
                    this.setSettings({ motor_calibration_action: '0' }).catch(this.error);
                    this._readCalibrationStatus();
                }, 5000);
            }
        }

        // Handle remaining SonoffCluster attributes (turbo_mode, network_led)
        const skipKeys = ['switch_mode', 'motor_calibration_action', 'motor_calibration_status'];
        const otherKeys = changedKeys.filter(key => !skipKeys.includes(key));
        if (otherKeys.length > 0) {
            await this.writeAttributes(SonoffCluster, newSettings, otherKeys);
        }
    }

    async _readCalibrationStatus() {
        this.readAttribute(SonoffCluster, ['motor_calibration_status'], (data) => {
            if (data.motor_calibration_status !== undefined) {
                const statusText = data.motor_calibration_status === 1 ? 'Calibrated' : 'Uncalibrated';
                this.log(`Motor calibration status: ${statusText}`);
                this.setSettings({ motor_calibration_status: statusText }).catch(this.error);
            }
        });
    }

    async checkAttributes() {
        this.readAttribute(SonoffCluster, ['network_led', 'turbo_mode', 'switch_mode'], (data) => {
            if (data.switch_mode !== undefined) {
                data.switch_mode = String(data.switch_mode);
            }
            this.setSettings(data).catch(this.error);
        });

        this._readCalibrationStatus();
    }

}

module.exports = SonoffMINIZBRBS;
