'use strict';

const SonoffBase = require('../sonoffbase');
const { CLUSTER } = require('zigbee-clusters');

class SonoffS60ZBTPF extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        if (this.hasCapability('onoff')) {
            this.registerCapability('onoff', CLUSTER.ON_OFF);
        }

        if (this.hasCapability('measure_power')) {
            this.registerCapability('measure_power', CLUSTER.ELECTRICAL_MEASUREMENT, {
                get: 'activePower',
                report: 'activePower'
            });
        }

        if (this.hasCapability('measure_voltage')) {
            this.registerCapability('measure_voltage', CLUSTER.ELECTRICAL_MEASUREMENT, {
                get: 'rmsVoltage',
                report: 'rmsVoltage'
            });
        }

        if (this.hasCapability('measure_current')) {
            this.registerCapability('measure_current', CLUSTER.ELECTRICAL_MEASUREMENT, {
                get: 'rmsCurrent',
                getParser: value => value / 1000,
                report: 'rmsCurrent',
                reportParser: value => value / 1000
            });
        }

        if (this.hasCapability('meter_power')) {
            this.registerCapability('meter_power', CLUSTER.METERING, {
                get: 'currentSummationDelivered',
                getParser: value => value / 1000,
                report: 'currentSummationDelivered',
                reportParser: value => value / 1000
            });
        }

        this.checkAttributes();
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        if (changedKeys.includes('power_on_behavior')) {
            try {
                await this.zclNode.endpoints[1].clusters.onOff.writeAttributes({ powerOnBehavior: newSettings.power_on_behavior });
            } catch (error) {
                this.log('Error updating the power on behavior');
            }
        }
    }

    async checkAttributes() {
        this.readAttribute(CLUSTER.ON_OFF, ['powerOnBehavior'], (data) => {
            if (data && data.powerOnBehavior !== undefined) {
                this.setSettings({ power_on_behavior: data.powerOnBehavior }).catch(this.error);
            }
        });
    }

    async onDeleted() {
        this.log('S60ZBTPF smart plug removed');
        await super.onDeleted();
    }
}

module.exports = SonoffS60ZBTPF;
