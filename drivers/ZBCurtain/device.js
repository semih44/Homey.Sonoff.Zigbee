'use strict';

const SonoffBase = require('../sonoffbase');
const { CLUSTER } = require('zigbee-clusters');

class SonoffZBCurtain extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        this.log('Sonoff ZBCurtain init');

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
    }

}

module.exports = SonoffZBCurtain;
