'use strict';

const OccupancySensor = require('../occupancysensor');

class SonoffSNZB06P extends OccupancySensor {

    async onNodeInit({ zclNode }) {
        // Migration: remove alarm_contact capability added in older versions
        if (this.hasCapability('alarm_contact') === true) {
            await this.removeCapability('alarm_contact');
            await this.addCapability('alarm_motion');
        }

        await super.onNodeInit({ zclNode });
    }

}

module.exports = SonoffSNZB06P;
