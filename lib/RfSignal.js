'use strict';

const { RFSignal, RFUtil } = require('homey-rfdriver');

module.exports = class MySignal extends RFSignal {

  static FREQUENCY = '433';
  static ID = 'sonoff_rf';

  // This method converts a JavaScript object command
  // into a payload for our signal.
  static commandToPayload(cmd) {
    if( typeof cmd.code !== 'string' )
      //throw new RFError('Invalid code');
      return;
    const num = parseInt(cmd.code, 16);
    return RFUtil.numberToBitArray(num, 24);
  }

  // This method converts a received payload
  // into a JavaScript object command.
  // Its code is the hex string commandToPayload sends, like the code of a pair command.
  static payloadToCommand(payload) {
    const bits = payload.join("");
    const num = parseInt(bits, 2);
    const hex = num.toString(16);
    return { bits, num, hex, code: hex };
  }

  // This method takes a command object
  // and returns a device-unique data object
  static commandToDeviceData(command) {
    return {
      code: command.code,
    };
  }

  // This method is invoked when a new receiver is added
  // We can generate a random address, as if someone pressed
  // the button on a remote.
  static createPairCommand() {
    // Any 24-bit code, in the form a received code has
    return {
      code: Math.floor(Math.random() * 0x1000000).toString(16)
    };
  }

}