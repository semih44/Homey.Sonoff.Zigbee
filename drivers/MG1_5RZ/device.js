'use strict';

const OccupancySensor = require('../occupancysensor');

class SonoffMG15RZ extends OccupancySensor {

    async onNodeInit({ zclNode }) {
        // Migration: older versions offered an illuminance, which the radar does not report
        if (this.hasCapability('sonoff_illuminance') === true) {
            await this.removeCapability('sonoff_illuminance');
        }

        await super.onNodeInit({ zclNode });
    }

}

module.exports = SonoffMG15RZ;
