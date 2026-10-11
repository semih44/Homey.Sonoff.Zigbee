'use strict';

const { CLUSTER } = require('zigbee-clusters');
const SonoffBase = require('../sonoffbase');
const SonoffCluster = require('../../lib/SonoffCluster');
const {
    MEASUREMENTS, showMeasurement, listenToMeasurements, clearWhenOff, measurementReporting,
} = require('../../lib/EwelinkPowerMonitoring');

// What the wall switch did while the relay is detached (zigbee-herdsman-converters detachRelayActionEvent)
const DETACH_ACTIONS = { 1: 'single_click', 2: 'double_click', 3: 'long_press', 4: 'switch_on', 5: 'switch_off' };
const INCHING_SETTINGS = ['inching_enabled', 'inching_time', 'inching_mode'];

// SONOFF MINI-ZB1GSP switch with power monitoring (zigbee-herdsman-converters): the relay, the
// measurements of the MINI-ZB1 family and the switch settings of the eWeLink cluster
class SonoffMINIZB1GSP extends SonoffBase {

    async onNodeInit({ zclNode }) {
        await super.onNodeInit({ zclNode });

        this.registerCapability('onoff', CLUSTER.ON_OFF);

        const sonoff = zclNode.endpoints[1].clusters[SonoffCluster.NAME];
        listenToMeasurements(this, sonoff, { whileOn: true });
        clearWhenOff(this, zclNode.endpoints[1].clusters[CLUSTER.ON_OFF.NAME]);
        sonoff.on('attr.detach_relay_action_event', (event) => {
            const action = DETACH_ACTIONS[event];
            if (!action) return;
            this.homey.flow.getDeviceTriggerCard(`${this.driver.id}:detach_${action}`)
                .trigger(this, {}, {})
                .catch(this.error);
        });

        this.checkAttributes();
    }

    reportingConfigurations() {
        return [
            ...super.reportingConfigurations(),
            // zigbee-herdsman-converters m.onOff(): from MIN to MAX (65000 s) on every change
            { endpointId: 1, cluster: CLUSTER.ON_OFF, attributeName: 'onOff', minInterval: 0, maxInterval: 65000, minChange: 1 },
            ...measurementReporting(),
        ];
    }

    async onSettings({ newSettings, changedKeys }) {
        if (changedKeys.includes('power_on_behavior')) {
            await this.writePowerOnBehavior(newSettings.power_on_behavior);
        }

        const attributes = {};
        for (const key of ['network_led', 'power_on_delay_state']) {
            if (changedKeys.includes(key)) attributes[key] = newSettings[key];
        }
        if (changedKeys.includes('turbo_mode')) {
            attributes.turbo_mode = SonoffCluster.turboModeToRadioPower(newSettings.turbo_mode);
        }
        if (changedKeys.includes('power_on_delay_time')) {
            attributes.power_on_delay_time = SonoffCluster.secondsToPowerOnDelay(newSettings.power_on_delay_time);
        }
        if (changedKeys.includes('switch_mode')) {
            attributes.switch_mode = parseInt(newSettings.switch_mode, 10);
        }
        // The relay is bit 0 of the detach mode
        if (changedKeys.includes('detach_relay')) {
            attributes.detach_relay_mode2 = newSettings.detach_relay ? 0x01 : 0x00;
        }
        await this.writeAttributes(SonoffCluster, attributes);

        if (changedKeys.some(key => INCHING_SETTINGS.includes(key))) {
            await this.setInching(newSettings.inching_enabled, newSettings.inching_time, newSettings.inching_mode);
        }
    }

    async checkAttributes() {
        this.readPowerOnBehavior('power_on_behavior');

        const settingAttributes = ['network_led', 'turbo_mode', 'power_on_delay_state', 'power_on_delay_time', 'switch_mode', 'detach_relay_mode2'];
        this.readAttribute(SonoffCluster, settingAttributes, (data) => {
            const settings = {};
            for (const key of ['network_led', 'power_on_delay_state']) {
                if (data[key] !== undefined) settings[key] = data[key];
            }
            if (data.turbo_mode !== undefined) settings.turbo_mode = SonoffCluster.radioPowerToTurboMode(data.turbo_mode);
            if (data.power_on_delay_time !== undefined) {
                settings.power_on_delay_time = SonoffCluster.powerOnDelayToSeconds(data.power_on_delay_time);
            }
            if (data.switch_mode !== undefined) settings.switch_mode = String(data.switch_mode);
            if (data.detach_relay_mode2 !== undefined) settings.detach_relay = (data.detach_relay_mode2 & 0x01) !== 0;
            if (Object.keys(settings).length > 0) this.setSettings(settings).catch(this.error);
        });

        // Read apart from the settings: all eleven answers would hardly fit into one frame
        this.readAttribute(SonoffCluster, Object.keys(MEASUREMENTS), (data) => {
            for (const attribute of Object.keys(MEASUREMENTS)) showMeasurement(this, attribute, data[attribute], { whileOn: true });
        });
    }

}

module.exports = SonoffMINIZB1GSP;
