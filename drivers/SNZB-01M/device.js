'use strict';

const SonoffBase = require('../sonoffbase');
const SonoffButtonCluster = require('../../lib/SonoffButtonCluster');

const ACTION_MAP = {
    1: 'single',
    2: 'double',
    3: 'long',
    4: 'triple'
};

class SonoffSNZB01M extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        const driverId = this.driver.id;

        // Register attribute report listener on all 4 button endpoints
        for (let ep = 1; ep <= 4; ep++) {
            const endpoint = zclNode.endpoints[ep];
            if (!endpoint || !endpoint.clusters.SonoffButtonCluster) {
                this.log(`Endpoint ${ep} or SonoffButtonCluster not available`);
                continue;
            }

            const cluster = endpoint.clusters.SonoffButtonCluster;
            cluster.manufacturerId = 0x1286;

            cluster.on('attr.keyActionEvent', (value) => {
                const action = ACTION_MAP[value];
                if (!action) {
                    this.log(`Unknown keyActionEvent value: ${value} on endpoint ${ep}`);
                    return;
                }

                const triggerId = `${driverId}:${action}_button_${ep}`;
                this.log(`Button ${ep}: ${action} (keyActionEvent=${value})`);

                const triggerCard = this.homey.flow.getDeviceTriggerCard(triggerId);
                if (triggerCard) {
                    triggerCard.trigger(this, {}, {}).catch(this.error);
                } else {
                    this.error(`Flow trigger card not found: ${triggerId}`);
                }
            });

            this.log(`Registered SonoffButtonCluster listener on endpoint ${ep}`);
        }
    }
}

module.exports = SonoffSNZB01M;
