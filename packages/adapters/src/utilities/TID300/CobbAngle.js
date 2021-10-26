import { DicomMetaDictionary } from "../../DicomMetaDictionary.js";
import TID300Measurement from "./TID300Measurement.js";

export default class CobbAngle extends TID300Measurement {
    contentItem() {
        const {
            point1,
            point2,
            point3,
            point4,
            rAngle,
            ReferencedSOPSequence
        } = this.props;

        return this.getMeasurement([
            {
                RelationshipType: "CONTAINS",
                ValueType: "NUM",
                ConceptNameCodeSequence: {
                    CodeValue: "285285000",
                    CodingSchemeDesignator: "SCT",
                    CodeMeaning: "Cobb angle"
                },
                MeasuredValueSequence: {
                    MeasurementUnitsCodeSequence: {
                        CodeValue: "deg",
                        CodingSchemeDesignator: "UCUM",
                        CodingSchemeVersion: "1.4",
                        CodeMeaning: "\u00B0"
                    },
                    NumericValue: rAngle
                },
                ContentSequence: {
                    RelationshipType: "INFERRED FROM",
                    ValueType: "SCOORD",
                    GraphicType: "POLYLINE",
                    GraphicData: [
                        point1.x,
                        point1.y,
                        point2.x,
                        point2.y,
                        point3.x,
                        point3.y,
                        point4.x,
                        point4.y
                    ],
                    ContentSequence: {
                        RelationshipType: "SELECTED FROM",
                        ValueType: "IMAGE",
                        ReferencedSOPSequence
                    }
                }
            }
        ]);
    }
}
