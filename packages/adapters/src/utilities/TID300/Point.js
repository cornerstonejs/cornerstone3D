import { DicomMetaDictionary } from "../../DicomMetaDictionary.js";
import TID300Measurement from "./TID300Measurement.js";

export default class Point extends TID300Measurement {
    contentItem() {
        const {
            points,
            ReferencedSOPSequence,
            use3DSpatialCoordinates = false
        } = this.props;

        const GraphicData = use3DSpatialCoordinates
            ? [points[0].x, points[0].y, points[0].z]
            : [points[0].x, points[0].y];
        // Allow storing another point as part of an indicator showing a single point
        if (points.length == 2) {
            GraphicData.push(points[1].x);
            GraphicData.push(points[1].y);
            if (use3DSpatialCoordinates) GraphicData.push(points[1].z);
        }
        return this.getMeasurement([
            {
                RelationshipType: "CONTAINS",
                ValueType: "NUM",
                ConceptNameCodeSequence: {
                    CodeValue: "111010",
                    CodingSchemeDesignator: "DCM",
                    CodeMeaning: "Center"
                },
                //MeasuredValueSequence: ,
                ContentSequence: {
                    RelationshipType: "INFERRED FROM",
                    ValueType: use3DSpatialCoordinates ? "SCOORD3D" : "SCOORD",
                    GraphicType: "POINT",
                    GraphicData,
                    ContentSequence: use3DSpatialCoordinates
                        ? undefined
                        : {
                              RelationshipType: "SELECTED FROM",
                              ValueType: "IMAGE",
                              ReferencedSOPSequence
                          }
                }
            }
        ]);
    }
}
