import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import CORNERSTONE_4_TAG from "./cornerstone4Tag";

const { Ellipse: TID300Ellipse } = utilities.TID300;

const ELLIPTICALROI = "EllipticalRoi";

class EllipticalRoi {
    // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
    static getMeasurementData(MeasurementGroup) {
        const { defaultState, NUMGroup, SCOORDGroup } =
            MeasurementReport.getSetupMeasurementData(MeasurementGroup);

        const { GraphicData } = SCOORDGroup;

        const majorAxis = [
            { x: GraphicData[0], y: GraphicData[1] },
            { x: GraphicData[2], y: GraphicData[3] }
        ];
        const minorAxis = [
            { x: GraphicData[4], y: GraphicData[5] },
            { x: GraphicData[6], y: GraphicData[7] }
        ];

        // Calculate two opposite corners of box defined by two axes.

        const minorAxisLength = Math.sqrt(
            Math.pow(minorAxis[0].x - minorAxis[1].x, 2) +
                Math.pow(minorAxis[0].y - minorAxis[1].y, 2)
        );

        const minorAxisDirection = {
            x: (minorAxis[1].x - minorAxis[0].x) / minorAxisLength,
            y: (minorAxis[1].y - minorAxis[0].y) / minorAxisLength
        };

        const halfMinorAxisLength = minorAxisLength / 2;

        // First end point of major axis + half minor axis vector
        const corner1 = {
            x: majorAxis[0].x + minorAxisDirection.x * halfMinorAxisLength,
            y: majorAxis[0].y + minorAxisDirection.y * halfMinorAxisLength
        };

        // Second end point of major axis - half of minor axis vector
        const corner2 = {
            x: majorAxis[1].x - minorAxisDirection.x * halfMinorAxisLength,
            y: majorAxis[1].y - minorAxisDirection.y * halfMinorAxisLength
        };
        const state = {
            ...defaultState,
            toolType: EllipticalRoi.toolType,
            active: false,
            cachedStats: {
                area: NUMGroup ? NUMGroup.MeasuredValueSequence.NumericValue : 0
            },
            handles: {
                end: {
                    x: corner1.x,
                    y: corner1.y,
                    highlight: false,
                    active: false
                },
                initialRotation: 0,
                start: {
                    x: corner2.x,
                    y: corner2.y,
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

    static getTID300RepresentationArguments(tool) {
        const { cachedStats = {}, handles, finding, findingSites } = tool;
        const { start, end } = handles;
        const { area } = cachedStats;

        const halfXLength = Math.abs(start.x - end.x) / 2;
        const halfYLength = Math.abs(start.y - end.y) / 2;

        const points = [];

        const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

        if (halfXLength > halfYLength) {
            // X-axis major
            // Major axis
            points.push({ x: center.x - halfXLength, y: center.y });
            points.push({ x: center.x + halfXLength, y: center.y });
            // Minor axis
            points.push({ x: center.x, y: center.y - halfYLength });
            points.push({ x: center.x, y: center.y + halfYLength });
        } else {
            // Y-axis major
            // Major axis
            points.push({ x: center.x, y: center.y - halfYLength });
            points.push({ x: center.x, y: center.y + halfYLength });
            // Minor axis
            points.push({ x: center.x - halfXLength, y: center.y });
            points.push({ x: center.x + halfXLength, y: center.y });
        }

        const trackingIdentifierTextValue =
            "cornerstoneTools@^4.0.0:EllipticalRoi";

        return {
            area,
            points,
            trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || []
        };
    }
}

EllipticalRoi.toolType = ELLIPTICALROI;
EllipticalRoi.utilityToolType = ELLIPTICALROI;
EllipticalRoi.TID300Representation = TID300Ellipse;
EllipticalRoi.isValidCornerstoneTrackingIdentifier = TrackingIdentifier => {
    if (!TrackingIdentifier.includes(":")) {
        return false;
    }

    const [cornerstone4Tag, toolType] = TrackingIdentifier.split(":");

    if (cornerstone4Tag !== CORNERSTONE_4_TAG) {
        return false;
    }

    return toolType === ELLIPTICALROI;
};

MeasurementReport.registerTool(EllipticalRoi);

export default EllipticalRoi;
