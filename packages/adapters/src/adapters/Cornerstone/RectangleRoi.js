import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import CORNERSTONE_4_TAG from "./cornerstone4Tag";

const { Polyline: TID300Polyline } = utilities.TID300;

class RectangleRoi {
    static getMeasurementData(MeasurementGroup) {
        const { defaultState, SCOORDGroup, NUMGroup } =
            MeasurementReport.getSetupMeasurementData(MeasurementGroup);

        const state = {
            ...defaultState,
            toolType: RectangleRoi.toolType,
            handles: {
                start: {},
                end: {},
                textBox: {
                    active: false,
                    hasMoved: false,
                    movesIndependently: false,
                    drawnIndependently: true,
                    allowedOutsideImage: true,
                    hasBoundingBox: true
                },
                initialRotation: 0
            },
            cachedStats: {
                area: NUMGroup ? NUMGroup.MeasuredValueSequence.NumericValue : 0
            },
            color: undefined,
            invalidated: true
        };
        const intermediate = {};

        [
            state.handles.start.x,
            state.handles.start.y,
            intermediate.x,
            intermediate.y,
            state.handles.end.x,
            state.handles.end.y
        ] = SCOORDGroup.GraphicData;

        return state;
    }

    static getTID300RepresentationArguments(tool) {
        const { finding, findingSites, cachedStats = {}, handles } = tool;
        const { start, end } = handles;
        const points = [
            start,
            { x: start.x, y: end.y },
            end,
            { x: end.x, y: start.y }
        ];
        const { area, perimeter } = cachedStats;

        const trackingIdentifierTextValue =
            "cornerstoneTools@^4.0.0:RectangleRoi";

        return {
            points,
            area,
            perimeter,
            trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || []
        };
    }
}

RectangleRoi.toolType = "RectangleRoi";
RectangleRoi.utilityToolType = "RectangleRoi";
RectangleRoi.TID300Representation = TID300Polyline;
RectangleRoi.isValidCornerstoneTrackingIdentifier = TrackingIdentifier => {
    if (!TrackingIdentifier.includes(":")) {
        return false;
    }

    const [cornerstone4Tag, toolType] = TrackingIdentifier.split(":");

    if (cornerstone4Tag !== CORNERSTONE_4_TAG) {
        return false;
    }

    return toolType === RectangleRoi.toolType;
};

MeasurementReport.registerTool(RectangleRoi);

export default RectangleRoi;
