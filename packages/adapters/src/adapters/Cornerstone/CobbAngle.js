import MeasurementReport from "./MeasurementReport.js";
import TID300CobbAngle from "../../utilities/TID300/CobbAngle.js";
import CORNERSTONE_4_TAG from "./cornerstone4Tag";

const COBB_ANGLE = "CobbAngle";

class CobbAngle {
    constructor() {}

    // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
    static getMeasurementData(MeasurementGroup) {
        const {
            defaultState,
            NUMGroup,
            SCOORDGroup
        } = MeasurementReport.getSetupMeasurementData(MeasurementGroup);

        const state = {
            ...defaultState,
            rAngle: NUMGroup.MeasuredValueSequence.NumericValue,
            toolType: CobbAngle.toolType,
            handles: {
                start: {},
                end: {},
                start2: {
                    highlight: true,
                    drawnIndependently: true
                },
                end2: {
                    highlight: true,
                    drawnIndependently: true
                },
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
            state.handles.end.y,
            state.handles.start2.x,
            state.handles.start2.y,
            state.handles.end2.x,
            state.handles.end2.y
        ] = SCOORDGroup.GraphicData;

        return state;
    }

    static getTID300RepresentationArguments(tool) {
        const { handles, finding, findingSites } = tool;
        const point1 = handles.start;
        const point2 = handles.end;
        const point3 = handles.start2;
        const point4 = handles.end2;
        const rAngle = tool.rAngle;

        const trackingIdentifierTextValue = "cornerstoneTools@^4.0.0:CobbAngle";

        return {
            point1,
            point2,
            point3,
            point4,
            rAngle,
            trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || []
        };
    }
}

CobbAngle.toolType = COBB_ANGLE;
CobbAngle.utilityToolType = COBB_ANGLE;
CobbAngle.TID300Representation = TID300CobbAngle;
CobbAngle.isValidCornerstoneTrackingIdentifier = TrackingIdentifier => {
    if (!TrackingIdentifier.includes(":")) {
        return false;
    }

    const [cornerstone4Tag, toolType] = TrackingIdentifier.split(":");

    if (cornerstone4Tag !== CORNERSTONE_4_TAG) {
        return false;
    }

    return toolType === COBB_ANGLE;
};

MeasurementReport.registerTool(CobbAngle);

export default CobbAngle;
