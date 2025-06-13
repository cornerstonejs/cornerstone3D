import MeasurementReport from "./MeasurementReport";
import { utilities } from "dcmjs";
import BaseAdapter3D from "./BaseAdapter3D";
import CodingScheme from "./CodingScheme";
import { toScoord } from "../helpers";

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
        const {
            state,
            SCOORDGroup,
            scoordArgs,
            worldCoords,
            referencedImageId,
            ReferencedFrameNumber
        } = MeasurementReport.getSetupMeasurementData(
            MeasurementGroup,
            sopInstanceUIDToImageIdMap,
            metadata,
            this.toolType,
            imageToWorldCoords
        );

        const text = state.annotation.data.label;

        // Since the arrowAnnotate measurement is just a point, to generate the tool state
        // we derive the second point based on the image size relative to the first point.
        if (worldCoords.length === 1 && SCOORDGroup) {
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

            const { GraphicData } = SCOORDGroup;
            const secondPoint = imageToWorldCoords(referencedImageId, [
                GraphicData[0] + xOffset,
                GraphicData[1] + yOffset
            ]);

            worldCoords.push(secondPoint);
        }

        state.annotation.data = {
            ...state.annotation.data,
            text,
            handles: {
                arrowFirst: true,
                points: worldCoords,
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(
        tool,
        worldToImageCoords,
        is3DMeasurement = false
    ) {
        const { data, metadata, findingSites } = tool;
        let { finding } = tool;
        const { referencedImageId } = metadata;
        const scoordProps = {
            worldToImageCoords,
            is3DMeasurement,
            referencedImageId
        };

        const { points, arrowFirst } = data.handles;

        const point = arrowFirst ? points[0] : points[1];
        const point2 = arrowFirst ? points[1] : points[0];

        // Using image coordinates for 2D points
        const pointImage = toScoord(scoordProps, point);
        const pointImage2 = toScoord(scoordProps, point2);

        const TID300RepresentationArguments = {
            points: [pointImage, pointImage2],
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            findingSites: findingSites || [],
            finding,
            ReferencedFrameOfReferenceUID: is3DMeasurement
                ? metadata.FrameOfReferenceUID
                : null,
            use3DSpatialCoordinates: is3DMeasurement
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
