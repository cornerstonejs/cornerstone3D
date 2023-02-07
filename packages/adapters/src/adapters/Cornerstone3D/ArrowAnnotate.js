import MeasurementReport from "./MeasurementReport";
import { utilities } from "dcmjs";
import CORNERSTONE_3D_TAG from "./cornerstone3DTag";
import CodingScheme from "./CodingScheme";

const { Point: TID300Point } = utilities.TID300;

const ARROW_ANNOTATE = "ArrowAnnotate";
const trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${ARROW_ANNOTATE}`;

const { codeValues, CodingSchemeDesignator } = CodingScheme;

class ArrowAnnotate {
    static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        imageToWorldCoords,
        metadata
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
        const { data, metadata } = tool;
        let { finding, findingSites } = tool;
        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error(
                "ArrowAnnotate.getTID300RepresentationArguments: referencedImageId is not defined"
            );
        }

        const { points, arrowFirst } = data.handles;

        let point;

        if (arrowFirst) {
            point = points[0];
        } else {
            point = points[1];
        }

        const pointImage = worldToImageCoords(referencedImageId, point);

        const TID300RepresentationArguments = {
            points: [
                {
                    x: pointImage[0],
                    y: pointImage[1]
                }
            ],
            trackingIdentifierTextValue,
            findingSites: findingSites || []
        };

        // If freetext finding isn't present, add it from the tool text.
        if (!finding || finding.CodeValue !== codeValues.CORNERSTONEFREETEXT) {
            finding = {
                CodeValue: codeValues.CORNERSTONEFREETEXT,
                CodingSchemeDesignator,
                CodeMeaning: data.text
            };
        }

        TID300RepresentationArguments.finding = finding;

        return TID300RepresentationArguments;
    }
}

ArrowAnnotate.toolType = ARROW_ANNOTATE;
ArrowAnnotate.utilityToolType = ARROW_ANNOTATE;
ArrowAnnotate.TID300Representation = TID300Point;
ArrowAnnotate.isValidCornerstoneTrackingIdentifier = TrackingIdentifier => {
    if (!TrackingIdentifier.includes(":")) {
        return false;
    }

    const [cornerstone3DTag, toolType] = TrackingIdentifier.split(":");

    if (cornerstone3DTag !== CORNERSTONE_3D_TAG) {
        return false;
    }

    return toolType === ARROW_ANNOTATE;
};

MeasurementReport.registerTool(ArrowAnnotate);

export default ArrowAnnotate;
