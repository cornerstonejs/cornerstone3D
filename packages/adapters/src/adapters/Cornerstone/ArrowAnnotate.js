import MeasurementReport from "./MeasurementReport.js";
import TID300Point from "../../utilities/TID300/Point.js";
import CORNERSTONE_4_TAG from "./cornerstone4Tag";
import { toArray } from "../helpers.js";

const ARROW_ANNOTATE = "ArrowAnnotate";
const FINDING = "121071";
const FINDING_SITE = "G-C0E3";
const CORNERSTONEFREETEXT = "CORNERSTONEFREETEXT";

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

        const findingGroup = toArray(ContentSequence).find(
            group => group.ConceptNameCodeSequence.CodeValue === FINDING
        );

        const findingSiteGroups = toArray(ContentSequence).filter(
            group => group.ConceptNameCodeSequence.CodeValue === FINDING_SITE
        );

        const text = findingGroup.ConceptCodeSequence.CodeMeaning;

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
            visible: true,
            finding: findingGroup
                ? findingGroup.ConceptCodeSequence
                : undefined,
            findingSites: findingSiteGroups.map(fsg => {
                return { ...fsg.ConceptCodeSequence };
            })
        };

        return state;
    }

    static getTID300RepresentationArguments(tool) {
        const points = [tool.handles.start];

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
