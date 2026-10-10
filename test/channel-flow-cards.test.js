'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require('./helpers/homey-stub');
const { createZigbeeNode, deliverAttributeReport } = require('./helpers/zigbee');
const { createDevice, flushAsync } = require('./helpers/device');
const { endpointsFromCompose, capabilitiesFromCompose } = require('./helpers/compose');

const SonoffBase = require('../drivers/sonoffbase');
const SonoffZigbeeApp = require('../app');

const ON_OFF = 0x0006;
const CMD_OFF = 0x00;
const CMD_ON = 0x01;
const ON_OFF_ATTRIBUTE = 0x0000;
const BOOL = 0x10;

// Homey creates Flow cards only for the main onoff capability (Athom: none for sub-capabilities),
// so the channels of these switches get app cards with a channel argument
const CHANNELS = {
  'MINI-ZB2GS': 2, 'MINI-ZB2GS-L': 2, 'ZBM5-2C-80': 2, 'ZBM5-2C-120': 2, 'ZBM5-3C-80': 3, 'ZBM5-3C-120': 3,
};
const CARDS = {
  triggers: ['channel_turned_on', 'channel_turned_off'],
  conditions: ['channel_is_on'],
  actions: ['channel_turn_on', 'channel_turn_off', 'channel_toggle'],
};
const LANGUAGES = ['en', 'nl', 'da', 'de', 'es', 'fr', 'it', 'no', 'sv', 'pl', 'ru', 'ko'];
const FLOW_DIR = path.join(__dirname, '..', '.homeycompose', 'flow');

function readCard(type, id) {
  return JSON.parse(fs.readFileSync(path.join(FLOW_DIR, type, `${id}.json`), 'utf8'));
}

// Flow manager stand-in: records run listeners and triggers per card id
function fakeFlow() {
  const listeners = {};
  const triggered = [];
  const cardFor = id => ({
    registerRunListener: listener => { listeners[id] = listener; },
    trigger: async (...args) => { triggered.push([id, ...args]); },
  });
  return {
    listeners,
    triggered,
    flow: {
      getTriggerCard: cardFor, getDeviceTriggerCard: cardFor, getConditionCard: cardFor, getActionCard: cardFor,
    },
  };
}

async function startApp(flow) {
  const app = Object.assign(Object.create(SonoffZigbeeApp.prototype), { homey: { flow }, log() {}, error() {} });
  await app.onInit();
}

// A paired switch with all channels off (or not known yet), initialised with the real capability registration
async function startSwitch(driver, flow, { state = false } = {}) {
  const DeviceClass = require(`../drivers/${driver}/device.js`);
  const { zclNode, node, sent } = createZigbeeNode({ endpoints: endpointsFromCompose(driver) });
  const capabilities = Object.fromEntries(Object.keys(capabilitiesFromCompose(driver)).map(id => [id, state]));
  const { device } = createDevice(DeviceClass, { zclNode, node, capabilities });
  device.homey = { flow };

  const originalBaseInit = SonoffBase.prototype.onNodeInit;
  SonoffBase.prototype.onNodeInit = async () => {};
  try {
    await device.onNodeInit({ zclNode });
  } finally {
    SonoffBase.prototype.onNodeInit = originalBaseInit;
  }
  await flushAsync();
  sent.length = 0;
  return { device, node, sent };
}

function onOffCommands(sent) {
  return sent.filter(s => s.clusterId === ON_OFF && s.frame.frameControl.clusterSpecific)
    .map(s => [s.endpointId, s.frame.cmdId]);
}

function reportOnOff(node, endpointId, on) {
  return deliverAttributeReport(node, {
    endpointId, clusterId: ON_OFF, attributeId: ON_OFF_ATTRIBUTE, dataTypeId: BOOL, value: Buffer.from([on ? 1 : 0]),
  });
}

for (const [driver, channels] of Object.entries(CHANNELS)) {
  const family = `${channels}ch`;

  test(`${driver}: every channel card is offered for this switch with its ${channels} channels`, () => {
    for (const [type, ids] of Object.entries(CARDS)) {
      for (const id of ids) {
        const card = readCard(type, `${id}_${family}`);
        const deviceArg = card.args.find(arg => arg.type === 'device');
        const channelArg = card.args.find(arg => arg.name === 'channel');

        assert.ok(deviceArg.filter.replace('driver_id=', '').split('|').includes(driver), `${id}: device filter`);
        assert.deepEqual(channelArg.values.map(value => value.id),
          Array.from({ length: channels }, (_, i) => String(i + 1)), `${id}: channels`);
        for (const text of [card.title, card.titleFormatted, channelArg.title]) {
          assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${id}: languages`);
        }
      }
    }
  });

  test(`${driver}: "turn channel ${channels} on" switches that channel's endpoint on`, async () => {
    const { listeners, flow } = fakeFlow();
    await startApp(flow);
    const { device, sent } = await startSwitch(driver, flow);

    await listeners[`channel_turn_on_${family}`]({ device, channel: String(channels) }, {});

    assert.deepEqual(onOffCommands(sent), [[channels, CMD_ON]]);
  });

  test(`${driver}: "turn channel 1 off" switches the first endpoint off`, async () => {
    const { listeners, flow } = fakeFlow();
    await startApp(flow);
    const { device, sent } = await startSwitch(driver, flow);

    await listeners[`channel_turn_off_${family}`]({ device, channel: '1' }, {});

    assert.deepEqual(onOffCommands(sent), [[1, CMD_OFF]]);
  });

  test(`${driver}: "toggle channel 2" switches an off channel on and an on channel off`, async () => {
    const { listeners, flow } = fakeFlow();
    await startApp(flow);
    const { device, sent } = await startSwitch(driver, flow);

    await listeners[`channel_toggle_${family}`]({ device, channel: '2' }, {});
    await listeners[`channel_toggle_${family}`]({ device, channel: '2' }, {});

    assert.deepEqual(onOffCommands(sent), [[2, CMD_ON], [2, CMD_OFF]]);
  });

  test(`${driver}: "channel 2 is on" follows that channel`, async () => {
    const { listeners, flow } = fakeFlow();
    await startApp(flow);
    const { device, node } = await startSwitch(driver, flow);
    const isOn = () => listeners[`channel_is_on_${family}`]({ device, channel: '2' }, {});

    assert.equal(await isOn(), false);
    await reportOnOff(node, 2, true);
    await flushAsync();
    assert.equal(await isOn(), true);
  });

  test(`${driver}: channel ${channels} reporting a new state triggers "turned on" and "turned off" once`, async () => {
    const { listeners, triggered, flow } = fakeFlow();
    await startApp(flow);
    const { device, node } = await startSwitch(driver, flow);

    await reportOnOff(node, channels, true);
    await reportOnOff(node, channels, true);
    await reportOnOff(node, channels, false);
    await flushAsync();

    const channelTriggers = triggered.filter(([id]) => id.startsWith('channel_turned_'));
    assert.deepEqual(channelTriggers.map(([id, triggeredDevice, , state]) => [id, triggeredDevice === device, state]), [
      [`channel_turned_on_${family}`, true, { channel: channels }],
      [`channel_turned_off_${family}`, true, { channel: channels }],
    ]);
    // A flow for this channel runs, one for another channel does not
    const runListener = listeners[`channel_turned_on_${family}`];
    assert.equal(await runListener({ device, channel: String(channels) }, { channel: channels }), true);
    assert.equal(await runListener({ device, channel: '1' }, { channel: channels }), false);
  });

  test(`${driver}: the first state reported after pairing triggers nothing`, async () => {
    const { triggered, flow } = fakeFlow();
    await startApp(flow);
    // homey-zigbeedriver reads unknown values on start; this switch does not answer them
    const { node } = await startSwitch(driver, flow, { state: null });

    await reportOnOff(node, channels, true);
    await flushAsync();

    assert.deepEqual(triggered.filter(([id]) => id.startsWith('channel_turned_')), []);
  });
}
