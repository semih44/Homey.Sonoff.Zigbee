'use strict';

// Reads the driver manifests the way Homey uses them: pairing matches manufacturerName and
// productId, and only the clusters listed per endpoint exist on the device's ZCLNode.
const fs = require('fs');
const path = require('path');

const DRIVERS_DIR = path.join(__dirname, '..', '..', 'drivers');

function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function zigbeeDrivers() {
  return fs.readdirSync(DRIVERS_DIR)
    .map(id => ({ id, file: path.join(DRIVERS_DIR, id, 'driver.compose.json') }))
    .filter(({ file }) => fs.existsSync(file))
    .map(({ id, file }) => ({ id, zigbee: JSON.parse(fs.readFileSync(file, 'utf8')).zigbee }))
    .filter(({ zigbee }) => zigbee);
}

/** Drivers whose manifest claims a device with this manufacturer name and model id */
function matchingDrivers(manufacturerName, modelId) {
  return zigbeeDrivers()
    .filter(({ zigbee }) => asArray(zigbee.manufacturerName).includes(manufacturerName)
      && asArray(zigbee.productId).includes(modelId))
    .map(({ id }) => id);
}

/** Endpoint -> input cluster ids, as listed in the driver manifest */
function endpointsFromCompose(driverId) {
  const driver = zigbeeDrivers().find(({ id }) => id === driverId);
  return Object.fromEntries(Object.entries(driver.zigbee.endpoints)
    .map(([endpointId, endpoint]) => [endpointId, endpoint.clusters || []]));
}

/** Capabilities a newly paired device gets from the driver manifest, with no value yet */
function capabilitiesFromCompose(driverId) {
  const manifest = JSON.parse(fs.readFileSync(path.join(DRIVERS_DIR, driverId, 'driver.compose.json'), 'utf8'));
  return Object.fromEntries((manifest.capabilities || []).map(capability => [capability, null]));
}

module.exports = {
  zigbeeDrivers, matchingDrivers, endpointsFromCompose, capabilitiesFromCompose, asArray,
};
