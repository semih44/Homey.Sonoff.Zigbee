'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/homey-stub');
const { createZigbeeNode } = require('./helpers/zigbee');
const { createDevice } = require('./helpers/device');

const ON_OFF = 0x0006;
const SONOFF = 0xFC11;
const START_UP_ON_OFF = 0x4003;
const NETWORK_LED = 0x0001;
const POWER_ON_DELAY_TIME = 0x0015;
const MOTOR_CALIBRATION_ACTION = 0x5001;
// ZCL status codes
const UNSUPPORTED_ATTRIBUTE = 0x86;
const INVALID_VALUE = 0x87;

const CASES = [
  {
    name: 'S60ZBTPF power-on behavior (OnOff cluster)',
    driver: 'S60ZBTPF',
    endpoints: { 1: [ON_OFF, SONOFF] },
    rejectedWrites: { 1: { [ON_OFF]: { [START_UP_ON_OFF]: INVALID_VALUE } } },
    settings: { power_on_behavior: 'last_state' },
    status: 'INVALID_VALUE',
  },
  {
    name: 'ZBMINIR2 network LED (via SonoffBase.writeAttributes)',
    driver: 'ZBMINIR2',
    endpoints: { 1: [ON_OFF, SONOFF] },
    rejectedWrites: { 1: { [SONOFF]: { [NETWORK_LED]: UNSUPPORTED_ATTRIBUTE } } },
    settings: { network_led: false },
    status: 'UNSUPPORTED_ATTRIBUTE',
  },
  {
    name: 'MINI-ZB2GS channel 2 delay (direct cluster write)',
    driver: 'MINI-ZB2GS',
    endpoints: { 1: [ON_OFF, SONOFF], 2: [ON_OFF, SONOFF] },
    rejectedWrites: { 2: { [SONOFF]: { [POWER_ON_DELAY_TIME]: INVALID_VALUE } } },
    settings: { delayed_power_on_time_l2: 10 },
    status: 'INVALID_VALUE',
  },
];

for (const { name, driver, endpoints, rejectedWrites, settings, status } of CASES) {
  test(`${name}: a value the device rejects is reported instead of saved`, async () => {
    const DeviceClass = require(`../drivers/${driver}/device.js`);
    const { zclNode } = createZigbeeNode({ endpoints, rejectedWrites });
    const { device } = createDevice(DeviceClass, { zclNode });

    await assert.rejects(
      device.onSettings({ oldSettings: {}, newSettings: settings, changedKeys: Object.keys(settings) }),
      error => error.message.includes(status),
    );
  });
}

test('MINI-ZBRBS motor calibration: a command the device rejects is reported', async () => {
  const DeviceClass = require('../drivers/MINI-ZBRBS/device.js');
  const { zclNode } = createZigbeeNode({
    endpoints: { 1: [0x0102, SONOFF] },
    rejectedWrites: { 1: { [SONOFF]: { [MOTOR_CALIBRATION_ACTION]: UNSUPPORTED_ATTRIBUTE } } },
  });
  const { device } = createDevice(DeviceClass, { zclNode });

  await assert.rejects(device._sendCalibrationAction(2), error => error.message.includes('UNSUPPORTED_ATTRIBUTE'));
});
