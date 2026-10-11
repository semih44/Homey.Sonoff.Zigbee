'use strict';

const SonoffBase = require('./sonoffbase');
const { CLUSTER } = require('zigbee-clusters');
const { shownMeasurement } = require('../lib/shownMeasurement');

// zigbee-herdsman-converters m.temperature()/m.humidity(): at most every 10 s, at least hourly,
// and on a change of 1 °C / 1 %RH (measuredValue is in 0.01 units)
const DEFAULT_REPORTING = {
	temperature: { minInterval: 10, maxInterval: 3600, minChange: 100 },
	humidity: { minInterval: 10, maxInterval: 3600, minChange: 100 },
};

class TempHumiditySensor extends SonoffBase {

	// Overridden by the models for which zigbee-herdsman-converters configures other values
	get measurementReporting() {
		return DEFAULT_REPORTING;
	}

	async onNodeInit({zclNode}) {

		await super.onNodeInit(...arguments);
		
		// measure_temperature
		zclNode.endpoints[1].clusters[CLUSTER.TEMPERATURE_MEASUREMENT.NAME]
		.on('attr.measuredValue', this.onTemperatureMeasuredAttributeReport.bind(this));
  
		// measure_humidity
		zclNode.endpoints[1].clusters[CLUSTER.RELATIVE_HUMIDITY_MEASUREMENT.NAME]
		.on('attr.measuredValue', this.onRelativeHumidityMeasuredAttributeReport.bind(this));

		
		
	}

	reportingConfigurations() {
		const { temperature, humidity } = this.measurementReporting;
		return [
			...super.reportingConfigurations(),
			{
				endpointId: 1,
				cluster: CLUSTER.TEMPERATURE_MEASUREMENT,
				attributeName: 'measuredValue',
				...temperature
			},
			{
				endpointId: 1,
				cluster: CLUSTER.RELATIVE_HUMIDITY_MEASUREMENT,
				attributeName: 'measuredValue',
				...humidity
			}
		];
	}

	onTemperatureMeasuredAttributeReport(measuredValue) {
		// The sensor is awake now, so this is when a configuration it missed gets through
		this.ensureReporting();

		this._lastTemperature = measuredValue;
		this._showTemperature(this.getSettings());
	}

	onRelativeHumidityMeasuredAttributeReport(measuredValue) {
		this._lastHumidity = measuredValue;
		this._showHumidity(this.getSettings());
	}

	_showTemperature(settings) {
		if (this._lastTemperature === undefined) return;
		const value = shownMeasurement(this._lastTemperature, settings.temperature_offset, settings.temperature_decimals);
		this.setCapabilityValue('measure_temperature', value).catch(this.error);
	}

	_showHumidity(settings) {
		if (this._lastHumidity === undefined) return;
		const value = shownMeasurement(this._lastHumidity, settings.humidity_offset, settings.humidity_decimals);
		this.setCapabilityValue('measure_humidity', value).catch(this.error);
	}

	// Offset and decimals only change how a measurement is shown, so the last one is shown again at once
	// instead of with the next report, which may take up to an hour (StyraHem issue #87)
	settingsApplied(event) {
		super.settingsApplied(event);
		const { newSettings, changedKeys } = event;
		if (changedKeys.some(key => ['temperature_offset', 'temperature_decimals'].includes(key))) this._showTemperature(newSettings);
		if (changedKeys.some(key => ['humidity_offset', 'humidity_decimals'].includes(key))) this._showHumidity(newSettings);
	}

}

module.exports = TempHumiditySensor;
