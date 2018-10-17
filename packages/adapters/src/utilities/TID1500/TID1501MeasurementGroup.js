import { DicomMetaDictionary } from '../../DicomMetaDictionary.js';

export default class TID1501MeasurementGroup {
	constructor(TID300Measurements) {
		this.TID300Measurements = TID300Measurements
	}

	contentItem() {
        const { TID300Measurements } = this;

        // TODO: Is there nothing else in this group?
        let contentItem = [];

        let measurements = [];
        TID300Measurements.forEach(TID300Measurement => {
            measurements = measurements.concat(TID300Measurement.contentItem())
        });

        contentItem = contentItem.concat(measurements);

        return contentItem;
	}
}
