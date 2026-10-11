'use strict';

// Starts a device the way Homey does: with its driver (id and manifest), its node, the Homey
// managers it uses and the whole onNodeInit chain including SonoffBase.
const fs = require('fs');
const path = require('path');
const { createZigbeeNode } = require('./zigbee');
const { createDevice, flushAsync } = require('./device');
const { endpointsFromCompose, capabilitiesFromCompose } = require('./compose');

const APP = require('../../app.json');
const ENGLISH = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'locales', 'en.json'), 'utf8'));

// Homey's i18n for the English locale: dots for nested keys, __name__ placeholders
function englishText(key, tokens = {}) {
  const text = key.split('.').reduce((node, part) => (node ? node[part] : undefined), ENGLISH);
  return Object.entries(tokens).reduce((result, [name, value]) => result.split(`__${name}__`).join(value), text);
}

// Flow manager stand-in that records triggers
function fakeFlow() {
  const triggered = [];
  const card = id => ({ registerRunListener() {}, trigger: async (...args) => { triggered.push([id, ...args]); } });
  return {
    triggered,
    flow: { getTriggerCard: card, getDeviceTriggerCard: card, getConditionCard: card, getActionCard: card },
  };
}

/**
 * @param {string} driverId
 * @param {object} [options] - firstInit, capabilities (default: from the manifest, without values),
 *   settings, store, and the options of createZigbeeNode (attributeValues, rejectedWrites, failSend)
 */
async function startDevice(driverId, {
  firstInit = false, capabilities, settings = {}, store = {}, ...nodeOptions
} = {}) {
  const DeviceClass = require(`../../drivers/${driverId}/device.js`);
  const { zclNode, node, sent } = createZigbeeNode({ endpoints: endpointsFromCompose(driverId), ...nodeOptions });
  const { device, recorded } = createDevice(DeviceClass, {
    zclNode, node, firstInit, settings, store, capabilities: capabilities || capabilitiesFromCompose(driverId),
  });
  const { flow, triggered } = fakeFlow();
  device.driver = { id: driverId, manifest: APP.drivers.find(driver => driver.id === driverId) };
  device.homey = { flow, __: englishText, i18n: { getLanguage: () => 'en' } };

  await device.onNodeInit({ zclNode });
  await flushAsync();
  return { device, recorded, zclNode, node, sent, triggered };
}

module.exports = { startDevice, englishText };
