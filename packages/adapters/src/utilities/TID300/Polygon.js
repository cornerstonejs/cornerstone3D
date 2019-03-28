import { DicomMetaDictionary } from "../../DicomMetaDictionary.js";
import TID300Measurement from "./TID300Measurement.js";

/**
 * Expand an array of points stored as objects into
 * a flattened array of points
 *
 * @param points [{x: 0, y: 1}, {x: 1, y: 2}] or [{x: 0, y: 1, z: 0}, {x: 1, y: 2, z: 0}]
 * @return {Array} [point1x, point1y, point2x, point2y] or [point1x, point1y, point1z, point2x, point2y, point2z]
 */
function expandPoints(points) {
    const allPoints = [];

    points.forEach(point => {
        allPoints.push(point[0]);
        allPoints.push(point[1]);
        if (point[2] !== undefined) {
            allPoints.push(point[2]);
        }
    });

    return allPoints;
}

export default class Polygon extends TID300Measurement {
    constructor({
        points,
        lengths,
        ReferencedSOPSequence,
        use3DSpatialCoordinates = false
    }) {
        super();

        this.points = points;
        this.lengths = lengths;
        this.ReferencedSOPSequence = ReferencedSOPSequence;
        this.use3DSpatialCoordinates = use3DSpatialCoordinates;
    }

    contentItem() {
        const {
            points,
            lengths,
            ReferencedSOPSequence,
            use3DSpatialCoordinates = false
        } = this;

        const perimeter = {};
        const GraphicData = expandPoints(points);

        return [
            {
                RelationshipType: "HAS OBS CONTEXT",
                ValueType: "TEXT",
                ConceptNameCodeSequence: {
                    CodeValue: "112039",
                    CodingSchemeDesignator: "DCM",
                    CodeMeaning: "Tracking Identifier"
                },
                TextValue: "web annotation"
            },
            {
                RelationshipType: "HAS OBS CONTEXT",
                ValueType: "UIDREF",
                ConceptNameCodeSequence: {
                    CodeValue: "112040",
                    CodingSchemeDesignator: "DCM",
                    CodeMeaning: "Tracking Unique Identifier"
                },
                UID: DicomMetaDictionary.uid()
            },
            {
                RelationshipType: "CONTAINS",
                ValueType: "CODE",
                ConceptNameCodeSequence: {
                    CodeValue: "121071",
                    CodingSchemeDesignator: "DCM",
                    CodeMeaning: "Finding"
                },
                ConceptCodeSequence: {
                    CodeValue: "SAMPLEFINDING",
                    CodingSchemeDesignator: "99dcmjs",
                    CodeMeaning: "Sample Finding"
                }
            },
            {
                RelationshipType: "CONTAINS",
                ValueType: "NUM",
                ConceptNameCodeSequence: {
                    CodeValue: "G-A197",
                    CodingSchemeDesignator: "SRT",
                    CodeMeaning: "Perimeter"
                },
                MeasuredValueSequence: {
                    MeasurementUnitsCodeSequence: {
                        CodeValue: "mm",
                        CodingSchemeDesignator: "UCUM",
                        CodingSchemeVersion: "1.4",
                        CodeMeaning: "millimeter"
                    },
                    NumericValue: perimeter
                },
                ContentSequence: {
                    RelationshipType: "INFERRED FROM",
                    ValueType: use3DSpatialCoordinates ? "SCOORD3D" : "SCOORD",
                    GraphicType: "POLYGON",
                    GraphicData,
                    ContentSequence: use3DSpatialCoordinates
                        ? undefined
                        : {
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
                    CodeValue: "G-A166",
                    CodingSchemeDesignator: "SRT",
                    CodeMeaning: "Area"
                },
                MeasuredValueSequence: {
                    MeasurementUnitsCodeSequence: {
                        CodeValue: "mm2",
                        CodingSchemeDesignator: "UCUM",
                        CodingSchemeVersion: "1.4",
                        CodeMeaning: "SquareMilliMeter"
                    },
                    NumericValue: perimeter
                },
                ContentSequence: {
                    RelationshipType: "INFERRED FROM",
                    ValueType: use3DSpatialCoordinates ? "SCOORD3D" : "SCOORD",
                    GraphicType: "POLYGON",
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
        ];
    }
}
