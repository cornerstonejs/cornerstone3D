import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import CORNERSTONE_4_TAG from "./cornerstone4Tag";

const { Length: TID300Length } = utilities.TID300;

const LENGTH = "Length";

class Length {
    // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
    static getMeasurementData(MeasurementGroup) {
        const { defaultState, NUMGroup, SCOORDGroup } =
            MeasurementReport.getSetupMeasurementData(MeasurementGroup);

        const state = {
            ...defaultState,
            length: NUMGroup.MeasuredValueSequence.NumericValue,
            toolType: Length.toolType,
            handles: {
                start: {},
                end: {},
                textBox: {
                    hasMoved: false,
                    movesIndependently: false,
                    drawnIndependently: true,
                    allowedOutsideImage: true,
                    hasBoundingBox: true
                }
            }
        };

        [
            state.handles.start.x,
            state.handles.start.y,
            state.handles.end.x,
            state.handles.end.y
        ] = SCOORDGroup.GraphicData;

        return state;
    }

    static getTID300RepresentationArguments(tool) {
        const { handles, finding, findingSites } = tool;
        const point1 = handles.start;
        const point2 = handles.end;
        const distance = tool.length;

        const trackingIdentifierTextValue = "cornerstoneTools@^4.0.0:Length";

        return {
            point1,
            point2,
            distance,
            trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || []
        };
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
