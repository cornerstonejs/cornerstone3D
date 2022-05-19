import MeasurementReport from "./MeasurementReport.js";
import TID300Point from "../../utilities/TID300/Point.js";
import CORNERSTONE_3D_TAG from "./cornerstone3DTag";
import CodingScheme from "./CodingScheme";

const ARROW_ANNOTATE = "ArrowAnnotate";
const trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${ARROW_ANNOTATE}`;

const { codeValues, CodingSchemeDesignator } = CodingScheme;

class ArrowAnnotate {
    constructor() {}

    static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        imageToWorldCoords,
        metadata
    ) {
        const {
            defaultState,
            SCOORDGroup
        } = MeasurementReport.getSetupMeasurementData(
            MeasurementGroup,
            sopInstanceUIDToImageIdMap,
            metadata,
            ArrowAnnotate.toolType
        );

        const referencedImageId =
            defaultState.annotation.metadata.referencedImageId;

        const text = defaultState.metadata.label;

        const { GraphicData } = SCOORDGroup;

        const worldCoords = [];
        for (let i = 0; i < GraphicData.length; i += 2) {
            const point = imageToWorldCoords(referencedImageId, [
                GraphicData[i],
                GraphicData[i + 1]
            ]);
            worldCoords.push(point);
        }

        const state = defaultState;

        state.annotation.data = {
            text,
            handles: {
                points: [worldCoords[0], worldCoords[1]],
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            }
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

        const { points } = data.handles;

        const pointsImage = points.map(point => {
            const pointImage = worldToImageCoords(referencedImageId, point);
            return {
                x: pointImage[0],
                y: pointImage[1]
            };
        });

        const TID300RepresentationArguments = {
            points: pointsImage,
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
