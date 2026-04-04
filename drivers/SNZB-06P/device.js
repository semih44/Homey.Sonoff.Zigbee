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

        const brightCondition = this.homey.flow.getConditionCard('is_bright');
        brightCondition.registerRunListener(async (args, state) => {
            const illuminance = await this.getCapabilityValue('sonoff_illuminance');
            return illuminance === 'bright';
        });
    }

}

module.exports = SonoffSNZB06P;
