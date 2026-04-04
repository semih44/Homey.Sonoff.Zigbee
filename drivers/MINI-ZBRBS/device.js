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
        await this.writeAttributes(SonoffCluster, newSettings, changedKeys);
    }

    async checkAttributes() {
        this.readAttribute(SonoffCluster, ['network_led', 'turbo_mode'], (data) => {
            this.setSettings(data).catch(this.error);
        });
    }

}

module.exports = SonoffMINIZBRBS;
