import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import CORNERSTONE_4_TAG from "./cornerstone4Tag";
import { toArray } from "../helpers";

const { Bidirectional: TID300Bidirectional } = utilities.TID300;

const BIDIRECTIONAL = "Bidirectional";
const LONG_AXIS = "Long Axis";
const SHORT_AXIS = "Short Axis";
const FINDING = "121071";
const FINDING_SITE = "G-C0E3";

class Bidirectional {
    // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
    static getMeasurementData(MeasurementGroup) {
        const { ContentSequence } = MeasurementGroup;

        const findingGroup = toArray(ContentSequence).find(
            group => group.ConceptNameCodeSequence.CodeValue === FINDING
        );

        const findingSiteGroups = toArray(ContentSequence).filter(
            group => group.ConceptNameCodeSequence.CodeValue === FINDING_SITE
        );

        const longAxisNUMGroup = toArray(ContentSequence).find(
            group => group.ConceptNameCodeSequence.CodeMeaning === LONG_AXIS
        );

        const longAxisSCOORDGroup = toArray(
            longAxisNUMGroup.ContentSequence
        ).find(group => group.ValueType === "SCOORD");

        const shortAxisNUMGroup = toArray(ContentSequence).find(
            group => group.ConceptNameCodeSequence.CodeMeaning === SHORT_AXIS
        );

        const shortAxisSCOORDGroup = toArray(
            shortAxisNUMGroup.ContentSequence
        ).find(group => group.ValueType === "SCOORD");

        const { ReferencedSOPSequence } = longAxisSCOORDGroup.ContentSequence;
        const { ReferencedSOPInstanceUID, ReferencedFrameNumber } =
            ReferencedSOPSequence;

        // Long axis

        const longestDiameter = String(
            longAxisNUMGroup.MeasuredValueSequence.NumericValue
        );

        const shortestDiameter = String(
            shortAxisNUMGroup.MeasuredValueSequence.NumericValue
        );

        const bottomRight = {
            x: Math.max(
                longAxisSCOORDGroup.GraphicData[0],
                longAxisSCOORDGroup.GraphicData[2],
                shortAxisSCOORDGroup.GraphicData[0],
                shortAxisSCOORDGroup.GraphicData[2]
            ),
            y: Math.max(
                longAxisSCOORDGroup.GraphicData[1],
                longAxisSCOORDGroup.GraphicData[3],
                shortAxisSCOORDGroup.GraphicData[1],
                shortAxisSCOORDGroup.GraphicData[3]
            )
        };

        const state = {
            sopInstanceUid: ReferencedSOPInstanceUID,
            frameIndex: ReferencedFrameNumber || 1,
            toolType: Bidirectional.toolType,
            active: false,
            handles: {
                start: {
                    x: longAxisSCOORDGroup.GraphicData[0],
                    y: longAxisSCOORDGroup.GraphicData[1],
                    drawnIndependently: false,
                    allowedOutsideImage: false,
                    active: false,
                    highlight: false,
                    index: 0
                },
                end: {
                    x: longAxisSCOORDGroup.GraphicData[2],
                    y: longAxisSCOORDGroup.GraphicData[3],
                    drawnIndependently: false,
                    allowedOutsideImage: false,
                    active: false,
                    highlight: false,
                    index: 1
                },
                perpendicularStart: {
                    x: shortAxisSCOORDGroup.GraphicData[0],
                    y: shortAxisSCOORDGroup.GraphicData[1],
                    drawnIndependently: false,
                    allowedOutsideImage: false,
                    active: false,
                    highlight: false,
                    index: 2
                },
                perpendicularEnd: {
                    x: shortAxisSCOORDGroup.GraphicData[2],
                    y: shortAxisSCOORDGroup.GraphicData[3],
                    drawnIndependently: false,
                    allowedOutsideImage: false,
                    active: false,
                    highlight: false,
                    index: 3
                },
                textBox: {
                    highlight: false,
                    hasMoved: true,
                    active: false,
                    movesIndependently: false,
                    drawnIndependently: true,
                    allowedOutsideImage: true,
                    hasBoundingBox: true,
                    x: bottomRight.x + 10,
                    y: bottomRight.y + 10
                }
            },
            invalidated: false,
            isCreating: false,
            longestDiameter,
            shortestDiameter,
            toolName: "Bidirectional",
            visible: true,
            finding: findingGroup
                ? findingGroup.ConceptCodeSequence
                : undefined,
            findingSites: findingSiteGroups.map(fsg => fsg.ConceptCodeSequence)
        };

        return state;
    }

    static getTID300RepresentationArguments(tool) {
        const { start, end, perpendicularStart, perpendicularEnd } =
            tool.handles;
        const { shortestDiameter, longestDiameter, finding, findingSites } =
            tool;

        const trackingIdentifierTextValue =
            "cornerstoneTools@^4.0.0:Bidirectional";

        return {
            longAxis: {
                point1: start,
                point2: end
            },
            shortAxis: {
                point1: perpendicularStart,
                point2: perpendicularEnd
            },
            longAxisLength: longestDiameter,
            shortAxisLength: shortestDiameter,
            trackingIdentifierTextValue,
            finding: finding,
            findingSites: findingSites || []
        };
    }
}

Bidirectional.toolType = BIDIRECTIONAL;
Bidirectional.utilityToolType = BIDIRECTIONAL;
Bidirectional.TID300Representation = TID300Bidirectional;
Bidirectional.isValidCornerstoneTrackingIdentifier = TrackingIdentifier => {
    if (!TrackingIdentifier.includes(":")) {
        return false;
    }

    const [cornerstone4Tag, toolType] = TrackingIdentifier.split(":");

    if (cornerstone4Tag !== CORNERSTONE_4_TAG) {
        return false;
    }

    return toolType === BIDIRECTIONAL;
};

MeasurementReport.registerTool(Bidirectional);

export default Bidirectional;
