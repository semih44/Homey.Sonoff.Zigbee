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
        if (changedKeys.includes('switch_mode')) {
            const rawValue = parseInt(newSettings.switch_mode, 10);
            await this.writeAttribute(SonoffCluster, 'switch_mode', rawValue);
        }

        const otherKeys = changedKeys.filter(key => key !== 'switch_mode');
        if (otherKeys.length > 0) {
            await this.writeAttributes(SonoffCluster, newSettings, otherKeys);
        }
    }

    async checkAttributes() {
        this.readAttribute(SonoffCluster, ['network_led', 'turbo_mode', 'switch_mode'], (data) => {
            if (data.switch_mode !== undefined) {
                data.switch_mode = String(data.switch_mode);
            }
            this.setSettings(data).catch(this.error);
        });
    }

}

module.exports = SonoffMINIZBRBS;
