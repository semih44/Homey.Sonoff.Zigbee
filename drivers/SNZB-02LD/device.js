'use strict';

const SonoffBase = require('../sonoffbase');
const { CLUSTER } = require('zigbee-clusters');
const SonoffCluster = require('../../lib/SonoffCluster');

// zigbee-herdsman-converters SNZB-02LD: on a change of 0.2 °C, at most every 5 s, at least hourly
const TEMPERATURE_REPORTING = { minInterval: 5, maxInterval: 3600, minChange: 20 };

class SonoffSNZB02LD extends SonoffBase {

	async onNodeInit({ zclNode }) {
		await super.onNodeInit(...arguments);

		this.configureMeasurementReporting();

		// measure_temperature
		zclNode.endpoints[1].clusters[CLUSTER.TEMPERATURE_MEASUREMENT.NAME]
			.on('attr.measuredValue', this.onTemperatureMeasuredAttributeReport.bind(this));
	}

	configureMeasurementReporting() {
		return this.ensureAttributeReporting([
			{
				endpointId: 1,
				cluster: CLUSTER.TEMPERATURE_MEASUREMENT,
				attributeName: 'measuredValue',
				...TEMPERATURE_REPORTING
			}
		]);
	}

	onTemperatureMeasuredAttributeReport(measuredValue) {
		// The sensor is awake now, so this is when a configuration it missed gets through
		this.configureMeasurementReporting();

		const temperatureOffset = this.getSetting('temperature_offset') || 0;
		const parsedValue = this.getSetting('temperature_decimals') === '2'
			? Math.round((measuredValue / 100) * 100) / 100
			: Math.round((measuredValue / 100) * 10) / 10;
		this.setCapabilityValue('measure_temperature', parsedValue + temperatureOffset).catch(this.error);
	}

	async onSettings({ oldSettings, newSettings, changedKeys }) {
		this.log('Settings changed:', changedKeys);

		// Handle temperature_units (written to device via SonoffCluster)
		if (changedKeys.includes('temperature_units')) {
			try {
				const value = newSettings.temperature_units === 'fahrenheit' ? 1 : 0;
				await this.writeAttribute(SonoffCluster, 'temperature_units', value);
				this.log('Temperature units updated to', newSettings.temperature_units);
			} catch (error) {
				this.error('Error updating temperature_units:', error);
				throw new Error(`Failed to update temperature units: ${error.message}`);
			}
		}

		// Handle temperature_calibration (written to device via SonoffCluster, scaled by 100)
		if (changedKeys.includes('temperature_calibration')) {
			try {
				const scaledValue = Math.round(newSettings.temperature_calibration * 100);
				await this.writeAttribute(SonoffCluster, 'temperature_calibration', scaledValue);
				this.log('Temperature calibration updated to', newSettings.temperature_calibration);
			} catch (error) {
				this.error('Error updating temperature_calibration:', error);
				throw new Error(`Failed to update temperature calibration: ${error.message}`);
			}
		}
	}

	async checkAttributes() {
		this.readAttribute(SonoffCluster, ['temperature_units', 'temperature_calibration'], (data) => {
			this.log('Read SonoffCluster attributes:', data);
			const settings = {};
			if (data.temperature_units !== undefined) {
				settings.temperature_units = data.temperature_units === 1 ? 'fahrenheit' : 'celsius';
			}
			if (data.temperature_calibration !== undefined) {
				settings.temperature_calibration = data.temperature_calibration / 100;
			}
			if (Object.keys(settings).length > 0) {
				this.setSettings(settings).catch(err => this.error('Error setting attributes:', err));
			}
		});
	}
}

module.exports = SonoffSNZB02LD;
