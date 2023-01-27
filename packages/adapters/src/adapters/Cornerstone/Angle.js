import { utilities } from "dcmjs";

import MeasurementReport from "./MeasurementReport";
import CORNERSTONE_4_TAG from "./cornerstone4Tag";

const { CobbAngle: TID300CobbAngle } = utilities.TID300;

const ANGLE = "Angle";

class Angle {
    /**
     * Generate TID300 measurement data for a plane angle measurement - use a CobbAngle, but label it as Angle
     */
    static getMeasurementData(MeasurementGroup) {
        const { defaultState, NUMGroup, SCOORDGroup } =
            MeasurementReport.getSetupMeasurementData(MeasurementGroup);

        const state = {
            ...defaultState,
            rAngle: NUMGroup.MeasuredValueSequence.NumericValue,
            toolType: Angle.toolType,
            handles: {
                start: {},
                middle: {},
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
            state.handles.middle.x,
            state.handles.middle.y,
            state.handles.middle.x,
            state.handles.middle.y,
            state.handles.end.x,
            state.handles.end.y
        ] = SCOORDGroup.GraphicData;

        return state;
    }

    static getTID300RepresentationArguments(tool) {
        const { handles, finding, findingSites } = tool;
        const point1 = handles.start;
        const point2 = handles.middle;
        const point3 = handles.middle;
        const point4 = handles.end;
        const rAngle = tool.rAngle;

        const trackingIdentifierTextValue = "cornerstoneTools@^4.0.0:Angle";

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

Angle.toolType = ANGLE;
Angle.utilityToolType = ANGLE;
Angle.TID300Representation = TID300CobbAngle;
Angle.isValidCornerstoneTrackingIdentifier = TrackingIdentifier => {
    if (!TrackingIdentifier.includes(":")) {
        return false;
    }

    const [cornerstone4Tag, toolType] = TrackingIdentifier.split(":");

    if (cornerstone4Tag !== CORNERSTONE_4_TAG) {
        return false;
    }

    return toolType === ANGLE;
};

MeasurementReport.registerTool(Angle);

export default Angle;
