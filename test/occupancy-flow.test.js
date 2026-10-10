'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createDevice } = require('./helpers/device');

const OccupancySensor = require('../drivers/occupancysensor');

const CASES = [
  { driver: 'SNZB-06P', cardId: 'is_bright' },
  { driver: 'MG1_5RZ', cardId: 'mg15rz_is_bright' },
];

function fakeFlow() {
  const listeners = {};
  return {
    listeners,
    flow: {
      getConditionCard: id => ({ registerRunListener: fn => { listeners[id] = fn; } }),
    },
  };
}

function sensorWithIlluminance(illuminance) {
  return { getCapabilityValue: id => (id === 'sonoff_illuminance' ? illuminance : undefined) };
}

for (const { driver, cardId } of CASES) {
  test(`${driver}: the "${cardId}" condition answers for the device selected in the flow`, async () => {
    const DriverClass = require(`../drivers/${driver}/driver.js`);
    const { listeners, flow } = fakeFlow();
    const driverInstance = Object.assign(Object.create(DriverClass.prototype), {
      homey: { flow }, log() {}, error() {},
    });

    await driverInstance.onInit();

    assert.equal(await listeners[cardId]({ device: sensorWithIlluminance('bright') }, {}), true);
    assert.equal(await listeners[cardId]({ device: sensorWithIlluminance('dim') }, {}), false);
  });

  test(`${driver}: a device starting up does not take over the "${cardId}" condition`, async () => {
    const DriverClass = require(`../drivers/${driver}/driver.js`);
    const DeviceClass = require(`../drivers/${driver}/device.js`);
    const { listeners, flow } = fakeFlow();
    const driverInstance = Object.assign(Object.create(DriverClass.prototype), {
      homey: { flow }, log() {}, error() {},
    });
    const { device } = createDevice(DeviceClass, {
      capabilities: { alarm_motion: false, sonoff_illuminance: 'bright' },
    });
    device.homey = { flow };

    const originalSensorInit = OccupancySensor.prototype.onNodeInit;
    OccupancySensor.prototype.onNodeInit = async () => {};
    try {
      await driverInstance.onInit();
      await device.onNodeInit({ zclNode: {} });
    } finally {
      OccupancySensor.prototype.onNodeInit = originalSensorInit;
    }

    // The device must not register condition listeners itself, neither for its own nor another driver's card
    assert.deepEqual(Object.keys(listeners), [cardId]);
    // Another sensor that is dim must not be judged by the illuminance of the device that started last
    assert.equal(await listeners[cardId]({ device: sensorWithIlluminance('dim') }, {}), false);
  });
}
