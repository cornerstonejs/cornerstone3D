import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import CORNERSTONE_4_TAG from "./cornerstone4Tag";

const { Circle: TID300Circle } = utilities.TID300;

const CIRCLEROI = "CircleRoi";

class CircleRoi {
    /** Gets the measurement data for cornerstone, given DICOM SR measurement data. */
    static getMeasurementData(MeasurementGroup) {
        const { defaultState, NUMGroup, SCOORDGroup } =
            MeasurementReport.getSetupMeasurementData(MeasurementGroup);

        const { GraphicData } = SCOORDGroup;

        const center = { x: GraphicData[0], y: GraphicData[1] };
        const end = { x: GraphicData[2], y: GraphicData[3] };

        const state = {
            ...defaultState,
            toolType: CircleRoi.toolType,
            active: false,
            cachedStats: {
                area: NUMGroup
                    ? NUMGroup.MeasuredValueSequence.NumericValue
                    : 0,
                // Dummy values to be updated by cornerstone
                radius: 0,
                perimeter: 0
            },
            handles: {
                end: {
                    ...end,
                    highlight: false,
                    active: false
                },
                initialRotation: 0,
                start: {
                    ...center,
                    highlight: false,
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
            visible: true
        };

        return state;
    }

    /**
     * Gets the TID 300 representation of a circle, given the cornerstone representation.
     *
     * @param {Object} tool
     * @returns
     */
    static getTID300RepresentationArguments(tool) {
        const { cachedStats = {}, handles, finding, findingSites } = tool;
        const { start: center, end } = handles;
        const { area, radius } = cachedStats;

        const perimeter = 2 * Math.PI * radius;
        const points = [];

        points.push(center);
        points.push(end);

        const trackingIdentifierTextValue = "cornerstoneTools@^4.0.0:CircleRoi";

        return {
            area,
            perimeter,
            radius,
            points,
            trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || []
        };
    }
}

CircleRoi.toolType = CIRCLEROI;
CircleRoi.utilityToolType = CIRCLEROI;
CircleRoi.TID300Representation = TID300Circle;
CircleRoi.isValidCornerstoneTrackingIdentifier = TrackingIdentifier => {
    if (!TrackingIdentifier.includes(":")) {
        return false;
    }

    const [cornerstone4Tag, toolType] = TrackingIdentifier.split(":");

    if (cornerstone4Tag !== CORNERSTONE_4_TAG) {
        return false;
    }

    return toolType === CIRCLEROI;
};

MeasurementReport.registerTool(CircleRoi);

export default CircleRoi;
