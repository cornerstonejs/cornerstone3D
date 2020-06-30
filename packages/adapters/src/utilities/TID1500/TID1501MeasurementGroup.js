export default class TID1501MeasurementGroup {
    constructor(TID300Measurements) {
        this.TID300Measurements = TID300Measurements;
    }

    contentItem() {
        const { TID300Measurements } = this;

        // TODO: Is there nothing else in this group?
        let measurementGroups = [];

        TID300Measurements.forEach(TID300Measurement => {
            measurementGroups.push(
                this.getMeasurementGroup(TID300Measurement.contentItem())
            );
        });

        return measurementGroups;
    }

    getMeasurementGroup(contentSequenceEntries) {
        return {
            RelationshipType: "CONTAINS",
            ValueType: "CONTAINER",
            ConceptNameCodeSequence: {
                CodeValue: "125007",
                CodingSchemeDesignator: "DCM",
                CodeMeaning: "Measurement Group"
            },
            ContinuityOfContent: "SEPARATE",
            ContentSequence: [...contentSequenceEntries]
        };
    }
}
