import { utilities } from "dcmjs";

import MeasurementReport from "./MeasurementReport";
import CORNERSTONE_4_TAG from "./cornerstone4Tag";

const { Point: TID300Point } = utilities.TID300;

const ARROW_ANNOTATE = "ArrowAnnotate";
const CORNERSTONEFREETEXT = "CORNERSTONEFREETEXT";

class ArrowAnnotate {
    static getMeasurementData(MeasurementGroup) {
        const { defaultState, SCOORDGroup, findingGroup } =
            MeasurementReport.getSetupMeasurementData(MeasurementGroup);

        const text = findingGroup.ConceptCodeSequence.CodeMeaning;

        const { GraphicData } = SCOORDGroup;

        const state = {
            ...defaultState,
            toolType: ArrowAnnotate.toolType,
            active: false,
            handles: {
                start: {
                    x: GraphicData[0],
                    y: GraphicData[1],
                    highlight: true,
                    active: false
                },
                // Use a generic offset if the stored data doesn't have the endpoint, otherwise
                // use the actual endpoint.
                end: {
                    x:
                        GraphicData.length == 4
                            ? GraphicData[2]
                            : GraphicData[0] + 20,
                    y:
                        GraphicData.length == 4
                            ? GraphicData[3]
                            : GraphicData[1] + 20,
                    highlight: true,
                    active: false
                },
                textBox: {
                    hasMoved: false,
                    movesIndependently: false,
                    drawnIndependently: true,
                    allowedOutsideImage: true,
                    hasBoundingBox: true
                }
            },
            invalidated: true,
            text,
            visible: true
        };

        return state;
    }

    static getTID300RepresentationArguments(tool) {
        const points = [tool.handles.start, tool.handles.end];

        let { finding, findingSites } = tool;

        const TID300RepresentationArguments = {
            points,
            trackingIdentifierTextValue: `cornerstoneTools@^4.0.0:ArrowAnnotate`,
            findingSites: findingSites || []
        };

        // If freetext finding isn't present, add it from the tool text.
        if (!finding || finding.CodeValue !== CORNERSTONEFREETEXT) {
            finding = {
                CodeValue: CORNERSTONEFREETEXT,
                CodingSchemeDesignator: "CST4",
                CodeMeaning: tool.text
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

    if (cornerstone4Tag !== CORNERSTONE_4_TAG) {
        return false;
    }

    return toolType === ARROW_ANNOTATE;
};

MeasurementReport.registerTool(ArrowAnnotate);

export default ArrowAnnotate;
