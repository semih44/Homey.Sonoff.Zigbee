const { Cluster, ZCLDataTypes } = require("zigbee-clusters");

/**
 * Sonoff Button Custom Cluster (0xFC12)
 * Used by SNZB-01M four-way wireless button
 *
 * Reports keyActionEvent attribute with button press type:
 * 1=single, 2=double, 3=long, 4=triple
 * Endpoint ID identifies which button (1-4)
 */
class SonoffButtonCluster extends Cluster {

    static get ID() {
        return 0xFC12; // 64530
    }

    static get NAME() {
        return 'SonoffButtonCluster';
    }

    static get ATTRIBUTES() {
        return {
            keyActionEvent: {
                id: 0x0000,
                type: ZCLDataTypes.uint8
            }
        };
    }

    static get COMMANDS() {
        return {};
    }
}

Cluster.addCluster(SonoffButtonCluster);

module.exports = SonoffButtonCluster;
