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
            setParser: (value) => {
                const pct = this.getSetting('invert_cover') ? (1 - value) : value;
                return { percentageLiftValue: Math.round(pct * 100) };
            },
            reportParser: (value) => {
                const pct = value / 100;
                return this.getSetting('invert_cover') ? (1 - pct) : pct;
            }
        });

        this.checkAttributes();
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        // Handle switch_mode: convert string to uint8
        if (changedKeys.includes('switch_mode')) {
            await this.writeAttribute(SonoffCluster, 'switch_mode', parseInt(newSettings.switch_mode, 10));
        }

        // Handle calibration action: fire-and-forget (device won't respond in time)
        if (changedKeys.includes('motor_calibration_action')) {
            const action = parseInt(newSettings.motor_calibration_action, 10);
            if (action !== 0) {
                this._sendCalibrationAction(action);
                // Reset dropdown immediately
                this.setSettings({ motor_calibration_action: '0' }).catch(this.error);
            }
        }

        // Handle remaining SonoffCluster attributes (turbo_mode, network_led)
        const skipKeys = ['switch_mode', 'motor_calibration_action', 'motor_calibration_status'];
        const otherKeys = changedKeys.filter(key => !skipKeys.includes(key));
        if (otherKeys.length > 0) {
            await this.writeAttributes(SonoffCluster, newSettings, otherKeys);
        }
    }

    async _sendCalibrationAction(action) {
        const CALIBRATION_LABELS = {
            2: 'start_automatic', 3: 'start_manual', 4: 'clear',
            7: 'manual_fully_opened', 8: 'manual_fully_closed'
        };
        this.log(`Motor calibration: sending action ${CALIBRATION_LABELS[action] || action}`);

        try {
            const cluster = this.zclNode.endpoints[1].clusters.SonoffCluster;
            if (!cluster) throw new Error('SonoffCluster not available');
            cluster.manufacturerId = 0x1286;
            await cluster.writeAttributes({ motor_calibration_action: action });
            this.log(`Motor calibration action sent successfully`);
        } catch (error) {
            // Timeout is expected — device starts calibrating immediately
            this.log(`Motor calibration write returned: ${error.message} (expected during calibration)`);
        }

        // Poll calibration status multiple times to catch completion
        // Automatic calibration can take 30-90 seconds (full open + full close)
        const pollDelays = [10000, 30000, 60000, 90000, 120000];
        for (const delay of pollDelays) {
            setTimeout(() => this._readCalibrationStatus(), delay);
        }
    }

    async _readCalibrationStatus() {
        this.readAttribute(SonoffCluster, ['motor_calibration_status', 'motor_run_status'], (data) => {
            if (data.motor_calibration_status !== undefined) {
                const statusText = data.motor_calibration_status === 1 ? 'Calibrated' : 'Uncalibrated';
                this.log(`Motor calibration status: ${statusText}`);
                this.setSettings({ motor_calibration_status: statusText }).catch(this.error);
            }
            if (data.motor_run_status !== undefined) {
                const runLabels = { 0: 'Stop', 1: 'Forward', 2: 'Reverse' };
                this.log(`Motor run status: ${runLabels[data.motor_run_status] || data.motor_run_status}`);
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
