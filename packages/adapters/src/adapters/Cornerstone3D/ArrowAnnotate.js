import MeasurementReport from "./MeasurementReport.js";
import TID300Point from "../../utilities/TID300/Point.js";
import CORNERSTONE_3D_TAG from "./cornerstone3DTag";
import CodingScheme from "./CodingScheme";

const ARROW_ANNOTATE = "ArrowAnnotate";
const trackingIdentifierTextValue = "Cornerstone3DTools@^0.1.0:ArrowAnnotate";

const { codeValues, CodingSchemeDesignator } = CodingScheme;

class ArrowAnnotate {
    constructor() {}

    static getMeasurementData(MeasurementGroup, imageId, imageToWorldCoords) {
        const {
            defaultState,
            SCOORDGroup,
            findingGroup
        } = MeasurementReport.getSetupMeasurementData(MeasurementGroup);

        const text = findingGroup.ConceptCodeSequence.CodeMeaning;

        const { GraphicData } = SCOORDGroup;

        const worldCoords = [];
        for (let i = 0; i < GraphicData.length; i += 2) {
            const point = imageToWorldCoords(imageId, [
                GraphicData[i],
                GraphicData[i + 1]
            ]);
            worldCoords.push(point);
        }

        const state = {
            ...defaultState,
            toolType: ArrowAnnotate.toolType,
            data: {
                text,
                handles: {
                    points: [worldCoords[0], worldCoords[1]],
                    activeHandleIndex: 0,
                    textBox: {
                        hasMoved: false
                    }
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

    const [cornerstone4Tag, toolType] = TrackingIdentifier.split(":");

    if (cornerstone4Tag !== CORNERSTONE_3D_TAG) {
        return false;
    }

    return toolType === ARROW_ANNOTATE;
};

MeasurementReport.registerTool(ArrowAnnotate);

export default ArrowAnnotate;
