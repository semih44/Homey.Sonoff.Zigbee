const { Cluster, ZCLDataTypes, ZCLDataType } = require("zigbee-clusters");
const { assertWriteSucceeded } = require('./writeStatus');

const SONOFF_MANUFACTURER_ID = 0x1286;

// BITMAP8 (0x18) carried as a plain number. ZCLDataTypes.map8 cannot be used for attribute writes
// in zigbee-clusters 1.4.0: its encoder reports 0 written bytes when the value does not start at
// offset 0 of the buffer, which cuts the value off the frame.
const BITMAP8 = new ZCLDataType(0x18, 'bitmap8', 1,
    (buf, value, i) => buf.writeUInt8(value & 0xff, i) - i,
    (buf, i) => buf.readUInt8(i));

// BITMAP16 (0x19) as a plain number, for the same reason
const BITMAP16 = new ZCLDataType(0x19, 'bitmap16', 2,
    (buf, value, i) => buf.writeUInt16LE(value & 0xffff, i) - i,
    (buf, i) => buf.readUInt16LE(i));

// SNZB-06P24 spatial learning (zigbee-herdsman-converters spatialLearning): sent to start it, and
// answered by the sensor with the same command id
const CMD_SPATIAL_LEARNING = 0x04;

/**
 * Sonoff Custom Cluster (0xFC11 / 64529)
 * Manufacturer ID: 0x1286
 * 
 * Handles manufacturer-specific attributes and commands for Sonoff Zigbee devices
 */
class SonoffCluster extends Cluster {

    static get ID() {
        return 0xFC11; // 64529
    }
    
    static get NAME() {
        return 'SonoffCluster';
    }
    
    /**
     * Get list of attributes commonly used by ZBMINIR2 devices
     */
    static get ZBMINIR2_ATTRIBUTES() {
        return [
            'turbo_mode',
            'network_led',
            'power_on_delay_state',
            'power_on_delay_time',
            'switch_mode',
            'detach_mode'
        ];
    }
    
    /**
     * Turbo mode is the radio power attribute (0x0012): 0x09 normal, 0x14 turbo
     * @param {boolean} enabled
     * @returns {number} raw radio power
     */
    static turboModeToRadioPower(enabled) {
        return enabled ? 0x14 : 0x09;
    }

    /**
     * @param {number} radioPower - raw attribute value
     * @returns {boolean} turbo mode enabled
     */
    static radioPowerToTurboMode(radioPower) {
        return radioPower === 0x14;
    }

    /**
     * Delayed power-on time (attribute 0x0015) is transferred in 0.5 s units
     * @param {number} seconds
     * @returns {number} raw attribute value
     */
    static secondsToPowerOnDelay(seconds) {
        return Math.round(seconds * 2);
    }

    /**
     * @param {number} raw - attribute value in 0.5 s units
     * @returns {number} seconds
     */
    static powerOnDelayToSeconds(raw) {
        return raw / 2;
    }

    static get ATTRIBUTES() {
        return {
            child_lock: {
                id: 0x0000,
                type: ZCLDataTypes.bool
            },
            turbo_mode: {
                // ZBMINIR2 - Extended radio range mode
                // 9 (0x09) = Normal radio power
                // 20 (0x14) = Turbo radio power (extended range)
                id: 0x0012,
                type: ZCLDataTypes.int16
            },        
            // 0x0014-0x0016 are shared by all eWeLink devices (ZBMINIR2, MINI-ZB2GS(-L), MINI-ZBDIM, ...).
            // Each id must have exactly one name, otherwise incoming reports are emitted under the wrong one.
            power_on_delay_state: {
                // Enable/disable delayed power-on
                id: 0x0014,
                type: ZCLDataTypes.bool
            },
            power_on_delay_time: {
                // Delayed power-on time in 0.5 s units (write seconds * 2)
                id: 0x0015,
                type: ZCLDataTypes.uint16
            },
            switch_mode: {
                // External switch trigger mode, values depend on the device (zigbee-herdsman-converters):
                // ZBMINIR2, MINI-ZBRBS, MINI-ZB2GS(-L): 0 = edge, 1 = pulse, 2 = following(off), 130 = following(on)
                // MINI-ZBDIM: 0 = edge, 1 = pulse, 3 = double pulse, 4 = triple pulse
                id: 0x0016,
                type: ZCLDataTypes.uint8
            },
            detach_mode: {
                // ZBMINIR2 - Detach relay from physical switch
                // When enabled, physical switch sends commands without changing relay
                id: 0x0017,
                type: ZCLDataTypes.bool
            },
            device_work_mode: {
                // ZBM5 wall switches - Device work mode
                // 0=Zigbee end device, 1=Zigbee router
                id: 0x0018,
                type: ZCLDataTypes.uint8
            },
            detach_relay_mode2: {
                // ZBM5 wall switches, MINI-ZB2GS(-L) - Detach relay BITMAP8:
                // bit 0: outlet 1, bit 1: outlet 2, bit 2: outlet 3
                id: 0x0019,
                type: BITMAP8
            },
            detach_relay_action_event: {
                // MINI-ZB1GSP - What the wall switch did while the relay is detached (read-only):
                // 1=single_click, 2=double_click, 3=long_press, 4=switch_on, 5=switch_off
                id: 0x0028,
                type: ZCLDataTypes.uint8
            },
            network_led: {
                // ZBMINIR2, switches, plugs - Network status LED control
                id: 0x0001,
                type: ZCLDataTypes.bool
            },
            backlight: {
                // Switches - Backlight control
                id: 0x0002,
                type: ZCLDataTypes.bool
            },
            tamper: {
                id: 0x2000,
                type: ZCLDataTypes.uint8
            },
            illuminance: {
                id: 0x2001,
                type: ZCLDataTypes.uint8
            },
            // SNZB-06P24 - Detection zones of 0.5 m (zigbee-herdsman-converters occupancyZoneEnable):
            // bit n is the zone from n x 0.5 m to (n + 1) x 0.5 m
            occupancy_zone_enable: {
                id: 0x2016,
                type: BITMAP16
            },
            // SNZB-03PR2, SNZB-06P24 - Illuminance calibration in lx (zigbee-herdsman-converters illuminationCompensationOffset)
            illumination_compensation_offset: {
                id: 0x2018,
                type: ZCLDataTypes.int16
            },
            // SNZB-06P24 - Radar sensitivity, -6 to 6 (zigbee-herdsman-converters radarSensitivitySetting)
            radar_sensitivity: {
                id: 0x2021,
                type: ZCLDataTypes.int8
            },
            open_window: {
                id: 0x6000,
                type: ZCLDataTypes.bool
            },
            frost_protection_temperature: {
                id: 0x6002,
                type: ZCLDataTypes.int16
            },
            idle_steps: {
                id: 0x6003,
                type: ZCLDataTypes.uint16
            },
            closing_steps: {
                id: 0x6004,
                type: ZCLDataTypes.uint16
            },
            valve_opening_limit_voltage: {
                id: 0x6005,
                type: ZCLDataTypes.uint16
            },
            valve_closing_limit_voltage: {
                id: 0x6006,
                type: ZCLDataTypes.uint16
            },
            valve_motor_running_voltage: {
                id: 0x6007,
                type: ZCLDataTypes.uint16
            },
            valve_opening_degree: {
                id: 0x600b,
                type: ZCLDataTypes.uint8
            },
            valve_closing_degree: {
                id: 0x600c,
                type: ZCLDataTypes.uint8
            },
            // TRVZB - External temperature input (scale: /100)
            external_temperature_input: {
                id: 0x600d,
                type: ZCLDataTypes.int16
            },
            // TRVZB - Temperature sensor select
            // 0=internal, 1=external, 2=external_2, 3=external_3
            temperature_sensor_select: {
                id: 0x600e,
                type: ZCLDataTypes.uint8
            },
            // TRVZB - Temperature control accuracy (scale: /100, range -1.0 .. -0.2)
            temp_accuracy: {
                id: 0x6011,
                type: ZCLDataTypes.int16
            },
            // TRVZB - Temporary mode select (0=boost, 1=timer)
            temporary_mode: {
                id: 0x6014,
                type: ZCLDataTypes.uint8
            },
            // TRVZB - Temporary mode duration (seconds, scale: /60 for minutes)
            temporary_mode_time: {
                id: 0x6015,
                type: ZCLDataTypes.uint32
            },
            // TRVZB - Timer mode target temperature (scale: /100)
            temporary_mode_temp: {
                id: 0x6016,
                type: ZCLDataTypes.int16
            },
            // TRVZB - Smart temperature control (PID), BITMAP8: 0x00=off, 0x02=on
            smart_temperature_control: {
                id: 0x6017,
                type: BITMAP8
            },
            // MINI-ZBRBS - Motor calibration action
            // 2=start_automatic, 3=start_manual, 4=clear,
            // 7=manual_fully_opened, 8=manual_fully_closed
            motor_calibration_action: {
                id: 0x5001,
                type: ZCLDataTypes.uint8
            },
            // MINI-ZBRBS - Motor calibration status (read-only)
            // 0=Uncalibrated, 1=Calibrated
            motor_calibration_status: {
                id: 0x5012,
                type: ZCLDataTypes.uint8
            },
            // MINI-ZBRBS - Motor run status (read-only)
            // 0=Stop, 1=Forward, 2=Reverse
            motor_run_status: {
                id: 0x5013,
                type: ZCLDataTypes.uint8
            },
            // SNZB-02LD/02WD/02D - Temperature display units
            // 0=Celsius, 1=Fahrenheit
            temperature_units: {
                id: 0x0007,
                type: ZCLDataTypes.uint16
            },
            // SNZB-02D - Comfort temperature max (scale: /100)
            comfort_temperature_max: {
                id: 0x0003,
                type: ZCLDataTypes.int16
            },
            // SNZB-02D - Comfort temperature min (scale: /100)
            comfort_temperature_min: {
                id: 0x0004,
                type: ZCLDataTypes.int16
            },
            // SNZB-02D - Comfort humidity min (scale: /100)
            comfort_humidity_min: {
                id: 0x0005,
                type: ZCLDataTypes.uint16
            },
            // SNZB-02D - Comfort humidity max (scale: /100)
            comfort_humidity_max: {
                id: 0x0006,
                type: ZCLDataTypes.uint16
            },
            // SNZB-02LD/02WD/02D - Temperature calibration (scale: /100)
            temperature_calibration: {
                id: 0x2003,
                type: ZCLDataTypes.int16
            },
            // SNZB-02D/02WD/02P - Humidity calibration (scale: /100)
            humidity_calibration: {
                id: 0x2004,
                type: ZCLDataTypes.int16
            },
            // MINI-ZBDIM - Calibration action (CHAR_STR, the library writes the length byte)
            set_calibration_action: {
                id: 0x001d,
                type: ZCLDataTypes.string
            },
            // MINI-ZBDIM - Calibration status (read-only)
            // 0=uncalibrate, 1=calibrating, 2=failed, 3=calibrated
            calibration_status: {
                id: 0x001e,
                type: ZCLDataTypes.uint8
            },
            // MINI-ZBDIM - Transition time (scale: /10 for 0.1s units)
            transition_time: {
                id: 0x001f,
                type: ZCLDataTypes.uint32
            },
            // MINI-ZBDIM - Calibration progress (0-100%)
            calibration_progress: {
                id: 0x0020,
                type: ZCLDataTypes.uint8
            },
            // MINI-ZBDIM - Min brightness threshold (scale: /2.55 for %)
            min_brightness: {
                id: 0x4001,
                type: ZCLDataTypes.uint8
            },
            // MINI-ZBDIM - Dimming light rate (1-5)
            dimming_rate: {
                id: 0x4003,
                type: ZCLDataTypes.uint8
            },
            // MINI-ZBDIM - AC Current (scale: /1000 for A)
            ac_current: {
                id: 0x7004,
                type: ZCLDataTypes.uint32
            },
            // MINI-ZBDIM - AC Voltage (scale: /1000 for V)
            ac_voltage: {
                id: 0x7005,
                type: ZCLDataTypes.uint32
            },
            // MINI-ZBDIM - AC Power (scale: /1000 for W)
            ac_power: {
                id: 0x7006,
                type: ZCLDataTypes.uint32
            },
            // MINI-ZB1GP - Energy counters in Wh (zigbee-herdsman-converters totalEnergyConsumption,
            // totalOutputEnergyConsumption: energy fed back through the meter)
            total_energy: {
                id: 0x701e,
                type: ZCLDataTypes.uint32
            },
            total_output_energy: {
                id: 0x701f,
                type: ZCLDataTypes.uint32
            },
            // SWV - Real-time irrigation duration (seconds)
            realtime_irrigation_duration: {
                id: 0x5006,
                type: ZCLDataTypes.uint32
            },
            // SWV - Real-time irrigation volume (liters)
            realtime_irrigation_volume: {
                id: 0x5007,
                type: ZCLDataTypes.uint32
            },
            // SWV - Valve abnormal state (bitmask)
            // SWV: 0=normal, 1=water_shortage, 2=water_leakage, 3=both
            // SWV-ZFE/ZFU: bit0=water_shortage, bit1=water_leakage, bit3=fail_safe
            // (zigbee-herdsman-converters; the SWV-ZNE/ZNU without flow meter do not have it)
            valve_abnormal_state: {
                id: 0x500C,
                type: ZCLDataTypes.uint8
            },
            // SWV - Daily irrigation volume (liters)
            daily_irrigation_volume: {
                id: 0x500F,
                type: ZCLDataTypes.uint32
            },
            // SWV - Valve work state (0=idle, 1=working)
            valve_work_state: {
                id: 0x5010,
                type: ZCLDataTypes.bool
            },
            // SWV - Auto-close valve on water shortage timeout (0=disable, 30=30min)
            lack_water_close_valve_timeout: {
                id: 0x5011,
                type: ZCLDataTypes.uint16
            },
        };
    }

    static get COMMANDS() {
        return {
            protocolData: {
                id: 0x01,
                manufacturerSpecific: true,
                manufacturerId: 0x1286,
                args: {
                    data: ZCLDataTypes.buffer
                }
            },
            protocolDataResponse: {
                id: 0x0B, // cmdId 11
                args: {
                    data: ZCLDataTypes.buffer
                }
            },
            // SNZB-06P24 - Sub-command 0x00 and the time as uint64 in ms, without manufacturer code
            spatialLearning: {
                id: CMD_SPATIAL_LEARNING,
                args: {
                    data: ZCLDataTypes.buffer
                }
            }
        };
    }
    
    /**
     * Run attribute reads/writes as manufacturer-specific frames (code 0x1286).
     * zigbee-clusters derives the flag from the attribute definitions, which all Sonoff
     * devices share, so models that need it (e.g. ZBMicro radio power) opt in per call.
     * @param {function(SonoffCluster): Promise<*>} operation
     * @returns {Promise<*>}
     */
    async withManufacturerCode(operation) {
        this._checkForManufacturerSpecificAttributes = () => SONOFF_MANUFACTURER_ID;
        try {
            return await operation(this);
        } finally {
            delete this._checkForManufacturerSpecificAttributes;
        }
    }

    /**
     * Write attributes and fail when the device rejects any of them
     * @param {object} attributes
     * @returns {Promise<object>} writeAttributesResponse
     */
    async writeAttributes(attributes = {}) {
        const response = await super.writeAttributes(attributes);
        assertWriteSucceeded(response);
        return response;
    }

    /**
     * protocolDataResponse is a manufacturer-specific cluster command that zigbee-clusters cannot
     * match to the command definition, so it is emitted here for the device listeners. So is the
     * answer to the spatial learning, which zigbee-clusters would take for the command itself.
     * Everything else, including the global writeAttributesResponse that resolves pending writes,
     * must reach the default handling.
     *
     * @param {Object} frame - ZCL frame object
     * @param {Object} meta - Frame metadata
     * @param {Buffer} rawFrame - Undecoded frame
     * @returns {Promise<*>}
     */
    async handleFrame(frame, meta, rawFrame) {
        if (frame.frameControl.clusterSpecific && frame.cmdId === 0x0B) {
            this.emit('protocolDataResponse', { data: frame.data }, meta);
            return undefined;
        }
        if (frame.frameControl.clusterSpecific && frame.frameControl.directionToClient && frame.cmdId === CMD_SPATIAL_LEARNING) {
            this.emit('spatialLearningResponse', { data: frame.data }, meta);
            return undefined;
        }

        return super.handleFrame(frame, meta, rawFrame);
    }
}

Cluster.addCluster(SonoffCluster);

module.exports = SonoffCluster;
