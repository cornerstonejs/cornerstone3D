import MeasurementReport from "./MeasurementReport";
import { utilities } from "dcmjs";
import BaseAdapter3D from "./BaseAdapter3D";
import CodingScheme from "./CodingScheme";

const { Point: TID300Point } = utilities.TID300;
const { codeValues } = CodingScheme;

class ArrowAnnotate extends BaseAdapter3D {
    static {
        this.init("ArrowAnnotate", TID300Point);
        this.registerLegacy();
    }

    static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        imageToWorldCoords,
        metadata,
        _trackingIdentifier
    ) {
        const { defaultState, SCOORDGroup, ReferencedFrameNumber } =
            MeasurementReport.getSetupMeasurementData(
                MeasurementGroup,
                sopInstanceUIDToImageIdMap,
                metadata,
                ArrowAnnotate.toolType
            );

        const referencedImageId =
            defaultState.annotation.metadata.referencedImageId;

        const text = defaultState.annotation.metadata.label;

        const { GraphicData } = SCOORDGroup;

        const worldCoords = [];
        for (let i = 0; i < GraphicData.length; i += 2) {
            const point = imageToWorldCoords(referencedImageId, [
                GraphicData[i],
                GraphicData[i + 1]
            ]);
            worldCoords.push(point);
        }

        // Since the arrowAnnotate measurement is just a point, to generate the tool state
        // we derive the second point based on the image size relative to the first point.
        if (worldCoords.length === 1) {
            const imagePixelModule = metadata.get(
                "imagePixelModule",
                referencedImageId
            );

            let xOffset = 10;
            let yOffset = 10;

            if (imagePixelModule) {
                const { columns, rows } = imagePixelModule;
                xOffset = columns / 10;
                yOffset = rows / 10;
            }

            const secondPoint = imageToWorldCoords(referencedImageId, [
                GraphicData[0] + xOffset,
                GraphicData[1] + yOffset
            ]);

            worldCoords.push(secondPoint);
        }

        const state = defaultState;

        state.annotation.data = {
            text,
            handles: {
                arrowFirst: true,
                points: [worldCoords[0], worldCoords[1]],
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const { data, metadata, findingSites } = tool;
        let { finding } = tool;
        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            return this.getTID300RepresentationArgumentsSCOORD3D(tool);
        }

        const { points, arrowFirst } = data.handles;

        let point;
        let point2;

        if (arrowFirst) {
            point = points[0];
            point2 = points[1];
        } else {
            point = points[1];
            point2 = points[0];
        }

        // Using image coordinates for 2D points
        const pointImage = worldToImageCoords(referencedImageId, point);
        const pointImage2 = worldToImageCoords(referencedImageId, point2);

        const TID300RepresentationArguments = {
            points: [
                {
                    x: pointImage[0],
                    y: pointImage[1]
                },
                {
                    x: pointImage2[0],
                    y: pointImage2[1]
                }
            ],
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            findingSites: findingSites || [],
            finding,
            use3DSpatialCoordinates: false
        };

        // If freetext finding isn't present, add it from the tool text.
        if (!finding || finding.CodeValue !== codeValues.CORNERSTONEFREETEXT) {
            finding = {
                CodeValue: codeValues.CORNERSTONEFREETEXT,
                CodingSchemeDesignator: CodingScheme.CodingSchemeDesignator,
                CodeMeaning: data.text
            };
        }

        return TID300RepresentationArguments;
    }

    static getTID300RepresentationArgumentsSCOORD3D(tool) {
        const { data, findingSites } = tool;
        let { finding } = tool;

        const { points, arrowFirst } = data.handles;

        let point;
        let point2;

        if (arrowFirst) {
            point = points[0];
            point2 = points[1];
        } else {
            point = points[1];
            point2 = points[0];
        }

        // Using world coordinates for 3D points
        const pointImage = point;
        const pointImage2 = point2;

        const TID300RepresentationArguments = {
            points: [
                {
                    x: pointImage[0],
                    y: pointImage[1],
                    z: pointImage[2]
                },
                {
                    x: pointImage2[0],
                    y: pointImage2[1],
                    z: pointImage2[2]
                }
            ],
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            findingSites: findingSites || [],
            finding,
            use3DSpatialCoordinates: true
        };

        // If freetext finding isn't present, add it from the tool text.
        if (!finding || finding.CodeValue !== codeValues.CORNERSTONEFREETEXT) {
            finding = {
                CodeValue: codeValues.CORNERSTONEFREETEXT,
                CodingSchemeDesignator: CodingScheme.CodingSchemeDesignator,
                CodeMeaning: data.text
            };
        }

        return TID300RepresentationArguments;
    }
}

export default ArrowAnnotate;
