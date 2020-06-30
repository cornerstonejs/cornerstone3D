import MeasurementReport from "./MeasurementReport.js";
import TID300Point from "../../utilities/TID300/Point.js";
import CORNERSTONE_4_TAG from "./cornerstone4Tag";
import { toArray } from "../helpers.js";

const ARROW_ANNOTATE = "ArrowAnnotate";
const FINDING = "Finding";

class ArrowAnnotate {
    constructor() {}

    // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
    static getMeasurementData(MeasurementGroup) {
        const { ContentSequence } = MeasurementGroup;

        const NUMGroup = toArray(ContentSequence).find(
            group => group.ValueType === "NUM"
        );

        const SCOORDGroup = toArray(NUMGroup.ContentSequence).find(
            group => group.ValueType === "SCOORD"
        );

        const findingsGroup = toArray(ContentSequence).find(
            group => group.ConceptNameCodeSequence.CodeMeaning === FINDING
        );

        const text = findingsGroup.ConceptCodeSequence.CodeMeaning;

        const { GraphicData } = SCOORDGroup;

        const { ReferencedSOPSequence } = SCOORDGroup.ContentSequence;
        const {
            ReferencedSOPInstanceUID,
            ReferencedFrameNumber
        } = ReferencedSOPSequence;
        const state = {
            sopInstanceUid: ReferencedSOPInstanceUID,
            frameIndex: ReferencedFrameNumber || 0,
            toolType: ArrowAnnotate.toolType,
            active: false,
            handles: {
                start: {
                    x: GraphicData[0],
                    y: GraphicData[1],
                    highlight: true,
                    active: false
                },
                // TODO: How do we choose where the end goes?
                // Just put it pointing from the bottom right for now?
                end: {
                    x: GraphicData[0] + 20,
                    y: GraphicData[1] + 20,
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
        const points = [tool.handles.start];
        const trackingIdentifierTextValue = `cornerstoneTools@^4.0.0:ArrowAnnotate`;

        const findings = [
            {
                CodeValue: "CORNERSTONEFREETEXT",
                CodingSchemeDesignator: "CST4",
                CodeMeaning: tool.text
            }
        ];

        return { points, trackingIdentifierTextValue, findings };
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
