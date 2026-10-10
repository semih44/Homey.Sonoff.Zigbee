'use strict';

const SonoffBase = require('./sonoffbase');
const { CLUSTER } = require('zigbee-clusters');

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

		this.configureMeasurementReporting();
		
		// measure_temperature
		zclNode.endpoints[1].clusters[CLUSTER.TEMPERATURE_MEASUREMENT.NAME]
		.on('attr.measuredValue', this.onTemperatureMeasuredAttributeReport.bind(this));
  
		// measure_humidity
		zclNode.endpoints[1].clusters[CLUSTER.RELATIVE_HUMIDITY_MEASUREMENT.NAME]
		.on('attr.measuredValue', this.onRelativeHumidityMeasuredAttributeReport.bind(this));

		
		
	}

	configureMeasurementReporting() {
		const { temperature, humidity } = this.measurementReporting;
		return this.ensureAttributeReporting([
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
		]);
	}

	onTemperatureMeasuredAttributeReport(measuredValue) {
		// The sensor is awake now, so this is when a configuration it missed gets through
		this.configureMeasurementReporting();

		const temperatureOffset = this.getSetting('temperature_offset') || 0;
		const parsedValue = this.getSetting('temperature_decimals') === '2' ? Math.round((measuredValue / 100) * 100) / 100 : Math.round((measuredValue / 100) * 10) / 10;
		this.setCapabilityValue('measure_temperature', parsedValue + temperatureOffset).catch(this.error);
		//this.checkBattery();
	}

	onRelativeHumidityMeasuredAttributeReport(measuredValue) {
		const humidityOffset = this.getSetting('humidity_offset') || 0;
		const parsedValue = this.getSetting('humidity_decimals') === '2' ? Math.round((measuredValue / 100) * 100) / 100 : Math.round((measuredValue / 100) * 10) / 10;
		this.setCapabilityValue('measure_humidity', parsedValue + humidityOffset).catch(this.error);
		//this.checkBattery();
	}

}

module.exports = TempHumiditySensor;
