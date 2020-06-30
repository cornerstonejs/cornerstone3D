import { DicomMetaDictionary } from "../../DicomMetaDictionary.js";
import TID300Measurement from "./TID300Measurement.js";

export default class Bidirectional extends TID300Measurement {
    contentItem() {
        const {
            longAxis,
            shortAxis,
            longAxisLength,
            shortAxisLength,
            ReferencedSOPSequence
        } = this.props;

        return this.getMeasurement([
            {
                RelationshipType: "CONTAINS",
                ValueType: "NUM",
                ConceptNameCodeSequence: {
                    CodeValue: "G-A185",
                    CodingSchemeDesignator: "SRT",
                    CodeMeaning: "Long Axis"
                },
                MeasuredValueSequence: {
                    MeasurementUnitsCodeSequence: {
                        CodeValue: "mm",
                        CodingSchemeDesignator: "UCUM",
                        CodingSchemeVersion: "1.4",
                        CodeMeaning: "millimeter"
                    },
                    NumericValue: longAxisLength
                },
                ContentSequence: {
                    RelationshipType: "INFERRED FROM",
                    ValueType: "SCOORD",
                    GraphicType: "POLYLINE",
                    GraphicData: [
                        longAxis.point1.x,
                        longAxis.point1.y,
                        longAxis.point2.x,
                        longAxis.point2.y
                    ],
                    ContentSequence: {
                        RelationshipType: "SELECTED FROM",
                        ValueType: "IMAGE",
                        ReferencedSOPSequence
                    }
                }
            },
            {
                RelationshipType: "CONTAINS",
                ValueType: "NUM",
                ConceptNameCodeSequence: {
                    CodeValue: "G-A186",
                    CodingSchemeDesignator: "SRT",
                    CodeMeaning: "Short Axis"
                },
                MeasuredValueSequence: {
                    MeasurementUnitsCodeSequence: {
                        CodeValue: "mm",
                        CodingSchemeDesignator: "UCUM",
                        CodingSchemeVersion: "1.4",
                        CodeMeaning: "millimeter"
                    },
                    NumericValue: shortAxisLength
                },
                ContentSequence: {
                    RelationshipType: "INFERRED FROM",
                    ValueType: "SCOORD",
                    GraphicType: "POLYLINE",
                    GraphicData: [
                        shortAxis.point1.x,
                        shortAxis.point1.y,
                        shortAxis.point2.x,
                        shortAxis.point2.y
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
