'use strict';

const { CLUSTER, BoundCluster } = require('zigbee-clusters');

const SonoffCluster = require("../../lib/SonoffCluster");

const SonoffBase = require('../sonoffbase');

/**
 * Bound OnOff cluster used when Detach Relay mode is enabled.
 *
 * In Detach Relay mode, the physical button does NOT change the relay state
 * and does NOT send onOff attribute reports.
 * Instead, the device sends ZCL commands (e.g. "toggle") which are interpreted
 * as button events and mapped to Homey Flow triggers.
 */
class MyOnOffBoundCluster extends BoundCluster {
    constructor(node) {
        super();
        this.node = node;
        this._click = node.homey.flow.getDeviceTriggerCard("ZBMINIR2:click");
    }
    
    /**
     * Handle toggle command from physical switch
     * In detached mode, physical switch sends toggle commands without changing relay state
     */
    toggle() {
        this.node.log('Detach Mode: Physical switch toggled, triggering Flow Card');
        this._click.trigger(this.node, {}, {})
            .catch(err => this.node.error('Failed to trigger click flow:', err));
    }
}

class SonoffZBMINIR2 extends SonoffBase {

    /**
     * onNodeInit is called when the device is initialized.
     */
    async onNodeInit({ zclNode }) {
        
        await super.onNodeInit({zclNode});

        if (this.hasCapability('onoff')) {
            this.registerCapability('onoff', CLUSTER.ON_OFF);
        }

        // Configure attribute reporting for on/off state
        this.configureAttributeReporting([
            {
                endpointId: 1,
                cluster: CLUSTER.ON_OFF,
                attributeName: 'onOff',
                minInterval: 1,      // Minimum 1 second between reports
                maxInterval: 3600,   // Maximum 1 hour
                minChange: 1
            }
        ]).catch(err => this.error(`Failed to configure attribute reporting:`, err));

        // Bind toggle command trigger for detached relay mode
        this.zclNode.endpoints[1].bind(CLUSTER.ON_OFF.NAME, new MyOnOffBoundCluster(this));
        
        // ========================================
        // HANDLE cmdId 11 (0x0B) - protocolDataResponse
        // ========================================
        // Use event listener for manufacturer-specific command
        // This is the CORRECT way to handle manufacturer-specific server-to-client commands!
        
        const sonoffCluster = this.zclNode.endpoints[1].clusters.SonoffCluster;
        
        if (!sonoffCluster) {
            this.error(`SonoffCluster not available on this device`);
            return;
        }
        
        // CRITICAL: Set manufacturerId permanently on cluster instance
        // Required for zigbee-clusters to recognize manufacturer-specific commands
        sonoffCluster.manufacturerId = 0x1286;
        
        // Register event listener for protocolDataResponse (cmdId 11)
        sonoffCluster.on('protocolDataResponse', (payload) => {
            this.log(`ZBMINIR2: Received protocolDataResponse (cmdId 11)`);
            
            if (payload && payload.data && Buffer.isBuffer(payload.data)) {
                const buffer = payload.data;
                const cmdType = buffer[0];
                const status = buffer.length > 1 ? buffer[1] : null;
                
                this.log(`  Command type: 0x${cmdType.toString(16)}`);
                this.log(`  Status: 0x${status !== null ? status.toString(16) : 'N/A'} (${status === 0x00 ? 'SUCCESS' : 'FAILURE'})`);
                this.log(`  Raw data: ${buffer.toString('hex')}`);
                
                // Parse based on command type
                switch (cmdType) {
                    case 0x01:
                        // Response to protocolData command (inching, etc)
                        if (status === 0x00) {
                            this.log(`  Inching command executed successfully`);
                        } else if (status === 0x81) {
                            this.log(`  Inching rejected by firmware (check: detach_mode=false, compatible switch_mode, relay state)`);
                        } else {
                            this.error(`  Inching failed with status=0x${status !== null ? status.toString(16) : 'unknown'}`);
                        }
                        break;
                    default:
                        this.log(`  Unknown command type: 0x${cmdType.toString(16)}`);
                }
            } else {
                this.log(`  Received protocolDataResponse but no data`);
            }
        });
        
        this.log(`ZBMINIR2: protocolDataResponse event listener registered`);
        
        // ========================================
        // END cmdId 11 handler
        // ========================================
        
        // Read initial attributes from device
        this.checkAttributes();
        
        // Apply initial inching settings if defined
        const settings = this.getSettings();
        if (settings && settings.inching_enabled !== undefined) {
            try {
                const inchingTime = settings.inching_time || 1;
                const inchingMode = settings.inching_mode || 'on';
                
                await this.setInching(
                    settings.inching_enabled,
                    inchingTime,
                    inchingMode
                );
                this.log(`Initial inching settings applied`);
            } catch (error) {
                this.error(`Failed to apply initial inching settings:`, error);
            }
        }
    }

    /**
     * Convert switch_mode string to number (for writing to device)
     */
    _formatSwitchMode(mode) {
        return parseInt(mode, 10);
    }

    /**
     * Convert switch_mode number to string (for reading from device)
     */
    _parseSwitchMode(mode) {
        return String(mode);
    }

    /**
     * onSettings is called when the user updates the device's settings.
     */
    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.log(`Settings changed:`, changedKeys);

        // Handle power-on behavior (OnOff cluster - standard Zigbee, no manufacturer code needed).
        // The write only completes once the device has acknowledged it.
        if (changedKeys.includes("power_on_behavior")) {
            await this.writePowerOnBehavior(newSettings.power_on_behavior);
        }

        // Handle TurboMode separately - convert boolean to int16 before writing
        if (changedKeys.includes('turbo_mode')) {
            try {
                const rawValue = SonoffCluster.turboModeToRadioPower(newSettings.turbo_mode);
                this.log(`Writing TurboMode: ${newSettings.turbo_mode} → raw value: 0x${rawValue.toString(16)} (${rawValue})`);
                
                await this.writeAttribute(SonoffCluster, 'turbo_mode', rawValue);
                
                this.log(`TurboMode updated successfully to ${newSettings.turbo_mode}`);
            } catch (error) {
                this.error(`Error updating TurboMode:`, error);
                throw new Error(`Failed to update Turbo Mode: ${error.message}`);
            }
        }

        // Handle switch_mode separately - convert string to uint8 before writing
        if (changedKeys.includes('switch_mode')) {
            try {
                const rawValue = this._formatSwitchMode(newSettings.switch_mode);
                this.log(`Writing switch_mode: "${newSettings.switch_mode}" → raw value: ${rawValue}`);
                
                await this.writeAttribute(SonoffCluster, 'switch_mode', rawValue);
                
                this.log(`switch_mode updated successfully to ${newSettings.switch_mode}`);
            } catch (error) {
                this.error(`Error updating switch_mode:`, error);
                throw new Error(`Failed to update switch mode: ${error.message}`);
            }
        }

        // Handle other SonoffCluster attributes
        const otherSonoffKeys = changedKeys.filter(key =>
            SonoffCluster.ZBMINIR2_ATTRIBUTES.includes(key) &&
            key !== 'turbo_mode' &&
            key !== 'switch_mode'
        );
        
        if (otherSonoffKeys.length > 0) {
            try {
                this.log(`Updating other SonoffCluster attributes:`, otherSonoffKeys);
                const attributes = Object.fromEntries(otherSonoffKeys.map(key => [key, newSettings[key]]));
                if (attributes.power_on_delay_time !== undefined) {
                    attributes.power_on_delay_time = SonoffCluster.secondsToPowerOnDelay(attributes.power_on_delay_time);
                }
                await this.writeAttributes(SonoffCluster, attributes);
                this.log(`SonoffCluster attributes updated successfully`);
            } catch (error) {
                this.error(`Error updating SonoffCluster attributes:`, error);
                throw new Error(`Failed to update device settings: ${error.message}`);
            }
        }

        // Handle inching settings changes
        const inchingKeys = ['inching_enabled', 'inching_mode', 'inching_time'];
        const inchingChanged = changedKeys.some(key => inchingKeys.includes(key));
        
        if (inchingChanged) {
            try {
                await this.setInching(
                    newSettings.inching_enabled,
                    newSettings.inching_time,
                    newSettings.inching_mode
                );
                this.log(`Inching settings updated successfully`);
            } catch (error) {
                this.error(`Error updating inching settings:`, error);
                throw new Error(`Failed to update inching settings: ${error.message}`);
            }
        }
    }

    /**
     * Read and initialize device attributes
     */
    async checkAttributes() {
        
        // Read power-on behavior from OnOff cluster
        this.readPowerOnBehavior('power_on_behavior');
        
        // Read SonoffCluster attributes
        this.readAttribute(SonoffCluster, SonoffCluster.ZBMINIR2_ATTRIBUTES, (data) => {
            this.log(`Read SonoffCluster attributes:`, data);
            
            // Process and convert data
            const settingsData = { ...data };
            
            // Convert TurboMode from int16 to boolean
            if (settingsData.turbo_mode !== undefined) {
                const rawValue = settingsData.turbo_mode;
                const boolValue = SonoffCluster.radioPowerToTurboMode(rawValue);
                
                this.log(`TurboMode from device: raw=0x${rawValue.toString(16)} (${rawValue}) → boolean=${boolValue}`);
                settingsData.turbo_mode = boolValue;
            }

            // Delayed power-on time arrives in 0.5 s units, the setting is in seconds
            if (settingsData.power_on_delay_time !== undefined) {
                settingsData.power_on_delay_time = SonoffCluster.powerOnDelayToSeconds(settingsData.power_on_delay_time);
            }

            // Convert switch_mode from uint8 to string
            if (settingsData.switch_mode !== undefined) {
                const rawValue = settingsData.switch_mode;
                const stringValue = this._parseSwitchMode(rawValue);
                
                this.log(`switch_mode from device: raw=${rawValue} → string="${stringValue}"`);
                settingsData.switch_mode = stringValue;
            }
            
            // Apply settings to Homey UI
            this.setSettings(settingsData)
                .then(() => this.log(`Device settings initialized successfully`))
                .catch(err => this.error(`Error initializing settings:`, err));
        });
    }

    /**
     * onDeleted is called when the user deleted the device.
     */
    async onDeleted() {
        this.log(`ZBMINIR2 switch removed`);
        
        // Clean up event listener
        const sonoffCluster = this.zclNode?.endpoints?.[1]?.clusters?.SonoffCluster;
        if (sonoffCluster) {
            sonoffCluster.removeAllListeners('protocolDataResponse');
        }

        // Call parent cleanup
        await super.onDeleted();
    }

}

module.exports = SonoffZBMINIR2;
