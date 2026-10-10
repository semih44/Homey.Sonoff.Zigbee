'use strict';

/**
 * Inching (auto-off/auto-on) payload for the eWeLink protocolData command (cluster 0xFC11, cmd 0x01).
 * Layout as in zigbee-herdsman-converters (inchingControlSet):
 * [0] cmd 0x01, [1] sub-command 0x17, [2] length 0x07, [3] sequence 0x80,
 * [4] mode flags, [5] channel, [6..7] time in 0.5 s units (LE), [8..9] reserved,
 * [10] XOR checksum over bytes 0..9
 */
const CMD = 0x01;
const SUBCMD_INCHING = 0x17;
const PAYLOAD_LENGTH = 0x07;
const SEQ_NUM = 0x80;
const FLAG_ENABLE = 0x80;
const FLAG_MODE_ON = 0x01; // 'on': ON -> OFF after the time, 'off': OFF -> ON after the time
const MAX_SECONDS = 32767.5; // uint16 in 0.5 s units

/**
 * @param {object} options
 * @param {boolean} options.enabled
 * @param {'on'|'off'} options.mode
 * @param {number} options.seconds - 0 to 32767.5, sent with at least one 0.5 s unit
 * @param {number} [options.channel=0] - 0 for channel 1, 1 for channel 2
 * @returns {Buffer}
 */
function buildInchingPayload({ enabled, mode, seconds, channel = 0 }) {
  if (typeof enabled !== 'boolean') {
    throw new TypeError(`enabled must be boolean, got ${typeof enabled}`);
  }
  if (mode !== 'on' && mode !== 'off') {
    throw new TypeError(`mode must be "on" or "off", got "${mode}"`);
  }
  if (typeof seconds !== 'number' || seconds < 0 || seconds > MAX_SECONDS) {
    throw new RangeError(`time must be between 0 and ${MAX_SECONDS} seconds, got ${seconds}`);
  }

  const timeUnits = Math.max(Math.round(seconds * 2), 1);

  let modeFlags = 0x00;
  if (enabled) modeFlags |= FLAG_ENABLE;
  if (mode === 'on') modeFlags |= FLAG_MODE_ON;

  const payload = [
    CMD, SUBCMD_INCHING, PAYLOAD_LENGTH, SEQ_NUM,
    modeFlags,
    channel,
    timeUnits & 0xff,
    (timeUnits >> 8) & 0xff,
    0x00, 0x00,
  ];
  const checksum = payload.slice(0, PAYLOAD_LENGTH + 3).reduce((xor, byte) => xor ^ byte, 0x00);

  return Buffer.from([...payload, checksum]);
}

module.exports = { buildInchingPayload };
