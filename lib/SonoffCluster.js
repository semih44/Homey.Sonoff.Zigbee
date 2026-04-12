const { Cluster, ZCLDataTypes } = require("zigbee-clusters");

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
            power_on_delay_state: {
                // ZBMINIR2 - Enable/disable power-on delay
                id: 0x0014,
                type: ZCLDataTypes.bool        
            },
            power_on_delay_time: {
                // ZBMINIR2 - Power-on delay time in milliseconds
                id: 0x0015,
                type: ZCLDataTypes.uint16
            },
            switch_mode: {
                // ZBMINIR2 - Physical switch mode
                // 0x00 = edge (toggle on press)
                // 0x01 = pulse (momentary)
                // 0x02 = follow_on (follower mode - on)
                // 0x82 = follow_off (follower mode - off)
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
                // ZBM5 wall switches - Detach relay bitmap
                // Bit 0: outlet 1, Bit 1: outlet 2, Bit 2: outlet 3
                id: 0x0019,
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
            // MINI-ZBDIM - Delayed power-on state
            delayed_power_on_state: {
                id: 0x0014,
                type: ZCLDataTypes.bool
            },
            // MINI-ZBDIM - Delayed power-on time (scale: /2 for 0.5s units)
            delayed_power_on_time: {
                id: 0x0015,
                type: ZCLDataTypes.uint16
            },
            // MINI-ZBDIM - External trigger mode
            // 0=edge, 1=pulse, 3=double pulse, 4=triple pulse
            external_trigger_mode: {
                id: 0x0016,
                type: ZCLDataTypes.uint8
            },
            // MINI-ZBDIM - Calibration action (CHAR_STR)
            set_calibration_action: {
                id: 0x001d,
                type: ZCLDataTypes.string8
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
            // SWV-ZNE: bit0=water_shortage, bit1=water_leakage, bit2=frost, bit3=fail_safe
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
            }
        };
    }
    
    /**
     * CRITICAL FIX: Intercept standard Zigbee responses for custom cluster
     * 
     * The device sends standard responses that zigbee-clusters doesn't auto-handle
     * for custom clusters, so we must manually intercept them here.
     * 
     * @param {Object} frame - ZCL frame object
     * @param {number} frame.cmdId - Command ID
     * @param {Buffer} frame.data - Command data payload
     * @param {Object} meta - Frame metadata
     * @returns {void}
     */
    handleFrame(frame, meta) {
        // Handle writeAttributesResponse (standard Zigbee command 0x04)
        if (frame.cmdId === 0x04) {
            // This is a standard response to writeAttributes operations
            // zigbee-clusters handles this automatically for built-in clusters,
            // but not for custom clusters like SonoffCluster
            this.debug(`SonoffCluster: Received writeAttributesResponse (cmdId 4) - attributes written successfully`);
            return; // Prevent "unknown command" error
        }
        
        // Handle protocolDataResponse (manufacturer-specific command 0x0B)
        if (frame.cmdId === 0x0B) {
            this.debug(`SonoffCluster: Received protocolDataResponse (cmdId 11)`);
            // Emit event so listener in device.js can process it
            this.emit('protocolDataResponse', { data: frame.data }, meta);
            return; // Prevent "unknown command" error
        }
        
        // For all other commands, use default handling
        return super.handleFrame(frame, meta);
    }
}

Cluster.addCluster(SonoffCluster);

module.exports = SonoffCluster;
