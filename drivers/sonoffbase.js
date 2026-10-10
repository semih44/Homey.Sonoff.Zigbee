'use strict';

const { ZigBeeDevice } = require('homey-zigbeedriver');
const { debug, CLUSTER } = require('zigbee-clusters');

// Registers the OnOff cluster with the StartUpOnOff (powerOnBehavior) attribute. It must be
// loaded before any device creates its ZCLNode, which is why the shared base class requires it.
require('../lib/SonoffOnOffCluster');
const SonoffCluster = require('../lib/SonoffCluster');
const { buildInchingPayload } = require('../lib/SonoffInching');

if (process.env.DEBUG === "1") {
    debug(true);
}

class SonoffBase extends ZigBeeDevice {

    _lastPollAttributes = null;
    _originalHandleFrame = null;
    _handleFrameWrapper = null;

    async onNodeInit({zclNode}, options) {
        this.log(`NodeInit SonoffBase`);
        options = options || {};
        this._lastPollAttributes = Date.now();

        if (process.env.DEBUG === "1") {
            this.enableDebug();
        }
        this.printNode();

        if (options.noAttribCheck !== true) {
            if ("powerConfiguration" in zclNode.endpoints[1].clusters) {
                this._originalHandleFrame = this.node.handleFrame;
                this._handleFrameWrapper = this._onHandleFrame.bind(this);
                this.node.handleFrame = this._handleFrameWrapper;
            }
        }
    }

    /**
     * Handle frame wrapper for battery polling
     * Called on every Zigbee frame received
     */
    _onHandleFrame(...args) {
        if (this._originalHandleFrame) {
            this._originalHandleFrame.apply(this, args);
        }
        
        const now = Date.now();
        const dt = (now - this._lastPollAttributes) / 1000;
        
        if (dt > 60 * 60) {
            this._lastPollAttributes = now;
            this.checkBattery();
            this.checkAttributes();
        }
    }

    async checkAttributes() {
    }

    async checkBattery() {
        this.log(`Check battery`);
        
        try {
            this.log(`Ask battery`);
            const value = await this.zclNode.endpoints[1].clusters[CLUSTER.POWER_CONFIGURATION.NAME]
                .readAttributes("batteryPercentageRemaining");
            
            this.log(`BATTERY`, value);
            await this.setCapabilityValue('measure_battery', value.batteryPercentageRemaining / 2);
        } catch (error) {
            this.error(`Could not get battery status:`, error);
        }
    }

    async initAttribute(cluster, attr, handler) {
        if (!this.isFirstInit())
            return;
        this.readAttribute(cluster, attr, handler);
    }

    /**
     * Execute a cluster operation with temporary manufacturer ID override
     * @param {string} cluster - Cluster name
     * @param {number|null} manufacturerId - Manufacturer ID to set (null to skip)
     * @param {Function} operation - Async operation to execute with cluster
     * @returns {Promise<any>} Operation result
     */
    async _withManufacturerId(cluster, manufacturerId, operation) {
        const clusterObj = this.zclNode.endpoints[1].clusters[cluster];
        if (!clusterObj) {
            throw new Error(`Cluster ${cluster} not available on this device`);
        }
        
        const originalManufacturerId = clusterObj.manufacturerId;
        
        try {
            if (manufacturerId) {
                clusterObj.manufacturerId = manufacturerId;
            }
            return await operation(clusterObj);
        } finally {
            if (manufacturerId) {
                clusterObj.manufacturerId = originalManufacturerId;
            }
        }
    }

    /**
     * Read attributes from a cluster
     * Handles manufacturer-specific clusters (e.g., SonoffCluster 0xFC11)
     */
    async readAttribute(cluster, attr, handler) {
        if ("NAME" in cluster) {
            cluster = cluster.NAME;
        }
        if (!Array.isArray(attr)) {
            attr = [attr];
        }
        
        if (attr.length === 0) {
            this.log(`No attributes to read`);
            return;
        }
        
        const manufacturerId = cluster === 'SonoffCluster' ? 0x1286 : null;
        
        try {
            this.log(`Ask attribute`, attr);
            
            const value = await this._withManufacturerId(
                cluster,
                manufacturerId,
                (clusterObj) => clusterObj.readAttributes(...attr)
            );
            
            this.log(`Got attr`, attr, value);
            
            try {
                handler(value);
            } catch (handlerError) {
                this.error(`Error in attribute handler:`, handlerError);
            }
        } catch (error) {
            this.error(`Error reading attributes`, attr, error);
        }
    }

    /**
     * Write the power-on behavior (StartUpOnOff) of one endpoint.
     * Failures propagate, so Homey rejects the settings change instead of storing a value
     * the device never received.
     * @param {string} value - 'off', 'on', 'toggle' or 'last_state'
     * @param {number} [endpointId=1]
     */
    async writePowerOnBehavior(value, endpointId = 1) {
        try {
            await this.zclNode.endpoints[endpointId].clusters.onOff.writeAttributes({ powerOnBehavior: value });
        } catch (error) {
            this.error(`Error updating power-on behavior of endpoint ${endpointId}:`, error);
            throw new Error(`Failed to update power-on behavior: ${error.message}`);
        }
    }

    /**
     * Read the power-on behavior of one endpoint into the given setting
     * @param {string} settingKey
     * @param {number} [endpointId=1]
     */
    async readPowerOnBehavior(settingKey, endpointId = 1) {
        try {
            const { powerOnBehavior } = await this.zclNode.endpoints[endpointId].clusters.onOff
                .readAttributes('powerOnBehavior');
            if (powerOnBehavior !== undefined) {
                await this.setSettings({ [settingKey]: powerOnBehavior });
            }
        } catch (error) {
            this.error(`Could not read power-on behavior of endpoint ${endpointId}:`, error);
        }
    }

    /**
     * Read delayed power-on state and time of one endpoint into the given settings
     * @param {number} endpointId
     * @param {string} stateKey - checkbox setting for 0x0014
     * @param {string} timeKey - seconds setting for 0x0015
     */
    async readPowerOnDelay(endpointId, stateKey, timeKey) {
        try {
            const data = await this.zclNode.endpoints[endpointId].clusters.SonoffCluster
                .readAttributes('power_on_delay_state', 'power_on_delay_time');
            const settings = {};
            if (data.power_on_delay_state !== undefined) {
                settings[stateKey] = data.power_on_delay_state;
            }
            if (data.power_on_delay_time !== undefined) {
                settings[timeKey] = SonoffCluster.powerOnDelayToSeconds(data.power_on_delay_time);
            }
            if (Object.keys(settings).length > 0) {
                await this.setSettings(settings);
            }
        } catch (error) {
            this.error(`Could not read delayed power-on of endpoint ${endpointId}:`, error);
        }
    }

    /**
     * Configure inching (auto-off/auto-on) via the eWeLink protocolData command
     * @param {boolean} enabled
     * @param {number} time - seconds (0-32767.5, sent in 0.5 s units)
     * @param {'on'|'off'} mode - 'on': ON -> OFF after time, 'off': OFF -> ON after time
     */
    async setInching(enabled = false, time = 1, mode = 'on') {
        const payload = buildInchingPayload({ enabled, mode, seconds: time });

        const cluster = this.zclNode.endpoints[1].clusters.SonoffCluster;
        if (!cluster) {
            throw new Error('SonoffCluster not available - cannot set inching');
        }

        this.log('Sending inching command:', {
            enabled, mode, time_seconds: time, payload_hex: payload.toString('hex'),
        });
        await cluster.protocolData(
            { data: payload },
            { disableDefaultResponse: true, waitForResponse: false, manufacturerSpecific: true, manufacturerId: 0x1286 }
        );
    }

    async writeAttribute(cluster, attr, value) {
        const data = {};
        data[attr] = value;
        return this.writeAttributes(cluster, data);
    }

    /**
     * Write attributes to a cluster
     * Handles manufacturer-specific clusters (e.g., SonoffCluster 0xFC11)
     */
    async writeAttributes(cluster, attribs, filter = null) {
        if ("NAME" in cluster) {
            cluster = cluster.NAME;
        }
        
        const clusterObj = this.zclNode.endpoints[1].clusters[cluster];
        if (!clusterObj) {
            throw new Error(`Cluster ${cluster} not available on this device`);
        }
        
        const items = {};
        
        for (const key in attribs) {
            if (filter && !filter.includes(key))
                continue;
            if (!(key in clusterObj.constructor.attributes))
                continue;
            items[key] = attribs[key];
        }

        if (!Object.keys(items).length) {
            this.log(`Write attribute`, {});
            return;
        }

        this.log(`Write attribute`, items);
        
        const manufacturerId = cluster === 'SonoffCluster' ? 0x1286 : null;
        
        try {
            return await this._withManufacturerId(
                cluster,
                manufacturerId,
                (clusterObj) => clusterObj.writeAttributes(items)
            );
        } catch (error) {
            this.error(`Error write attr`, items, error);
            throw error;
        }
    }

    onDeleted() {
        this.log(`Sonoff device removed`);
        
        if (this._originalHandleFrame) {
            this.node.handleFrame = this._originalHandleFrame;
            this._originalHandleFrame = null;
            this._handleFrameWrapper = null;
        }
    }

}

module.exports = SonoffBase;
