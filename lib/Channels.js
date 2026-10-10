'use strict';

const { CLUSTER } = require('zigbee-clusters');

// Channel n of the multi-channel switches is onoff (n = 1) or onoff.channel_<n>, on endpoint n.

// homey-zigbeedriver 1.6 looks up its default configuration by the full capability id, so a
// sub-capability like onoff.channel_2 got none: no command when switched in Homey and no state from
// the switch. These are the defaults it uses for onoff (lib/system/capabilities/onoff/onOff.js).
const ON_OFF_CONFIGURATION = {
    get: 'onOff',
    getOpts: { getOnStart: true },
    set: value => (value ? 'setOn' : 'setOff'),
    setParser: () => ({}),
    report: 'onOff',
    reportParser: value => value,
};

/**
 * Configuration for registerCapability of the onoff capability of a channel
 * @param {number} channel - which is also the endpoint
 */
function channelOnOff(channel) {
    return { ...ON_OFF_CONFIGURATION, endpoint: channel };
}

// Homey creates Flow cards only for the main onoff capability, not for onoff.channel_2/3 (Athom:
// none for sub-capabilities). The multi-channel switches therefore share app cards with a channel
// argument, one set for the 2-channel and one for the 3-channel switches (.homeycompose/flow).
const FAMILIES = ['2ch', '3ch'];

function channelCapability(channel) {
    return Number(channel) === 1 ? 'onoff' : `onoff.channel_${channel}`;
}

/**
 * Registers the run listeners of the channel cards, once for the app
 * @param {object} homey
 */
function registerChannelFlowCards(homey) {
    const channelMatches = async ({ channel }, state) => Number(channel) === state.channel;

    for (const family of FAMILIES) {
        homey.flow.getDeviceTriggerCard(`channel_turned_on_${family}`).registerRunListener(channelMatches);
        homey.flow.getDeviceTriggerCard(`channel_turned_off_${family}`).registerRunListener(channelMatches);

        homey.flow.getConditionCard(`channel_is_on_${family}`)
            .registerRunListener(async ({ device, channel }) => device.getCapabilityValue(channelCapability(channel)) === true);

        homey.flow.getActionCard(`channel_turn_on_${family}`)
            .registerRunListener(async ({ device, channel }) => device.triggerCapabilityListener(channelCapability(channel), true));
        homey.flow.getActionCard(`channel_turn_off_${family}`)
            .registerRunListener(async ({ device, channel }) => device.triggerCapabilityListener(channelCapability(channel), false));
        homey.flow.getActionCard(`channel_toggle_${family}`)
            .registerRunListener(async ({ device, channel }) => {
                const capability = channelCapability(channel);
                return device.triggerCapabilityListener(capability, !device.getCapabilityValue(capability));
            });
    }
}

/**
 * Fires the channel triggers when a channel reports a new state. The switch reports the changes
 * made from Homey as well, so this covers switching from the app, flows and the wall switch.
 * @param {object} device
 * @param {object} zclNode
 * @param {number} channels - 2 or 3, the channel n is on endpoint n
 */
function triggerChannelChanges(device, zclNode, channels) {
    const turnedOn = device.homey.flow.getDeviceTriggerCard(`channel_turned_on_${channels}ch`);
    const turnedOff = device.homey.flow.getDeviceTriggerCard(`channel_turned_off_${channels}ch`);

    for (let channel = 1; channel <= channels; channel++) {
        let last = device.getCapabilityValue(channelCapability(channel));
        zclNode.endpoints[channel].clusters[CLUSTER.ON_OFF.NAME].on('attr.onOff', (on) => {
            const previous = last;
            last = on;
            // Unknown before, e.g. right after pairing: nothing changed that a flow could react to
            if (previous === null || previous === undefined || previous === on) return;
            (on ? turnedOn : turnedOff).trigger(device, {}, { channel }).catch(device.error);
        });
    }
}

module.exports = { channelOnOff, registerChannelFlowCards, triggerChannelChanges };
