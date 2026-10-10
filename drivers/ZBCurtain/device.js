'use strict';

const SonoffBase = require('../sonoffbase');
const { CLUSTER } = require('zigbee-clusters');

class SonoffZBCurtain extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        this.log('Sonoff ZBCurtain init');

        this.registerCapability('windowcoverings_state', CLUSTER.WINDOW_COVERING);

        // Zigbee lift percentage: 0 = open, 100 = closed; Homey: 1 = open, 0 = closed
        this.registerCapability('windowcoverings_set', CLUSTER.WINDOW_COVERING, {
            set: 'goToLiftPercentage',
            report: 'currentPositionLiftPercentage',
            setParser(value) {
                return { percentageLiftValue: Math.round((1 - value) * 100) };
            },
            reportParser(value) {
                return 1 - value / 100;
            }
        });
    }

}

module.exports = SonoffZBCurtain;
