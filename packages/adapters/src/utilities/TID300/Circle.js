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
        allPoints.push(point.x);
        allPoints.push(point.y);
    });

    return allPoints;
}

export default class Circle extends TID300Measurement {
    contentItem() {
        const {
            points,
            ReferencedSOPSequence,
            use3DSpatialCoordinates = false,
            perimeter,
            area
        } = this.props;

        // Combine all lengths to save the perimeter
        // @ToDO The permiter has to be implemented
        // const reducer = (accumulator, currentValue) => accumulator + currentValue;
        // const perimeter = lengths.reduce(reducer);
        const GraphicData = expandPoints(points);

        // TODO: Add Mean and STDev value of (modality?) pixels

        return this.getMeasurement([
            {
                RelationshipType: "CONTAINS",
                ValueType: "NUM",
                ConceptNameCodeSequence: {
                    CodeValue: "G-A197",
                    CodingSchemeDesignator: "SRT",
                    CodeMeaning: "Perimeter" // TODO: Look this up from a Code Meaning dictionary
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
                    GraphicType: "CIRCLE",
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
                // TODO: This feels weird to repeat the GraphicData
                RelationshipType: "CONTAINS",
                ValueType: "NUM",
                ConceptNameCodeSequence: {
                    CodeValue: "G-A166",
                    CodingSchemeDesignator: "SRT",
                    CodeMeaning: "Area" // TODO: Look this up from a Code Meaning dictionary
                },
                MeasuredValueSequence: {
                    MeasurementUnitsCodeSequence: {
                        CodeValue: "mm2",
                        CodingSchemeDesignator: "UCUM",
                        CodingSchemeVersion: "1.4",
                        CodeMeaning: "SquareMilliMeter"
                    },
                    NumericValue: area
                },
                ContentSequence: {
                    RelationshipType: "INFERRED FROM",
                    ValueType: use3DSpatialCoordinates ? "SCOORD3D" : "SCOORD",
                    GraphicType: "CIRCLE",
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
