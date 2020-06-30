import MeasurementReport from "./MeasurementReport.js";
import TID300Length from "../../utilities/TID300/Length.js";
import CORNERSTONE_4_TAG from "./cornerstone4Tag";
import { toArray } from "../helpers.js";

const LENGTH = "Length";

class Length {
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

        const { ReferencedSOPSequence } = SCOORDGroup.ContentSequence;
        const {
            ReferencedSOPInstanceUID,
            ReferencedFrameNumber
        } = ReferencedSOPSequence;
        const lengthState = {
            sopInstanceUid: ReferencedSOPInstanceUID,
            frameIndex: ReferencedFrameNumber || 1,
            length: NUMGroup.MeasuredValueSequence.NumericValue,
            toolType: Length.toolType
        };

        lengthState.handles = { start: {}, end: {} };
        [
            lengthState.handles.start.x,
            lengthState.handles.start.y,
            lengthState.handles.end.x,
            lengthState.handles.end.y
        ] = SCOORDGroup.GraphicData;

        lengthState.handles.textBox = {
            hasMoved: false,
            movesIndependently: false,
            drawnIndependently: true,
            allowedOutsideImage: true,
            hasBoundingBox: true
        };

        return lengthState;
    }

    static getTID300RepresentationArguments(tool) {
        const point1 = tool.handles.start;
        const point2 = tool.handles.end;
        const distance = tool.length;

        const trackingIdentifierTextValue = "cornerstoneTools@^4.0.0:Length";

        return { point1, point2, distance, trackingIdentifierTextValue };
    }
}

Length.toolType = LENGTH;
Length.utilityToolType = LENGTH;
Length.TID300Representation = TID300Length;
Length.isValidCornerstoneTrackingIdentifier = TrackingIdentifier => {
    if (!TrackingIdentifier.includes(":")) {
        return false;
    }

    const [cornerstone4Tag, toolType] = TrackingIdentifier.split(":");

    if (cornerstone4Tag !== CORNERSTONE_4_TAG) {
        return false;
    }

    return toolType === LENGTH;
};

MeasurementReport.registerTool(Length);

export default Length;
