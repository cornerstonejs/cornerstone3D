import { utilities } from "dcmjs";
import CORNERSTONE_3D_TAG from "./cornerstone3DTag";
import MeasurementReport from "./MeasurementReport";

const { CobbAngle: TID300CobbAngle } = utilities.TID300;

const MEASUREMENT_TYPE = "Angle";
const trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${MEASUREMENT_TYPE}`;

class Angle {
    public static toolType = MEASUREMENT_TYPE;
    public static utilityToolType = MEASUREMENT_TYPE;
    public static TID300Representation = TID300CobbAngle;
    public static isValidCornerstoneTrackingIdentifier = TrackingIdentifier => {
        if (!TrackingIdentifier.includes(":")) {
            return false;
        }

        const [cornerstone3DTag, toolType] = TrackingIdentifier.split(":");

        if (cornerstone3DTag !== CORNERSTONE_3D_TAG) {
            return false;
        }

        return toolType === MEASUREMENT_TYPE;
    };

    // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
    public static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        imageToWorldCoords,
        metadata
    ) {
        const { defaultState, NUMGroup, SCOORDGroup, ReferencedFrameNumber } =
            MeasurementReport.getSetupMeasurementData(
                MeasurementGroup,
                sopInstanceUIDToImageIdMap,
                metadata,
                Angle.toolType
            );

        const referencedImageId =
            defaultState.annotation.metadata.referencedImageId;

        const { GraphicData } = SCOORDGroup;
        const worldCoords = [];
        for (let i = 0; i < GraphicData.length; i += 2) {
            const point = imageToWorldCoords(referencedImageId, [
                GraphicData[i],
                GraphicData[i + 1]
            ]);
            worldCoords.push(point);
        }

        const state = defaultState;

        state.annotation.data = {
            handles: {
                points: [worldCoords[0], worldCoords[1], worldCoords[3]],
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            },
            cachedStats: {
                [`imageId:${referencedImageId}`]: {
                    angle: NUMGroup
                        ? NUMGroup.MeasuredValueSequence.NumericValue
                        : null
                }
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    public static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;

        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error(
                "Angle.getTID300RepresentationArguments: referencedImageId is not defined"
            );
        }

        const start1 = worldToImageCoords(referencedImageId, handles.points[0]);
        const middle = worldToImageCoords(referencedImageId, handles.points[1]);

        const end = worldToImageCoords(referencedImageId, handles.points[2]);

        const point1 = { x: start1[0], y: start1[1] };
        const point2 = { x: middle[0], y: middle[1] };
        const point3 = point2;
        const point4 = { x: end[0], y: end[1] };

        const { angle } = cachedStats[`imageId:${referencedImageId}`] || {};

        // Represented as a cobb angle
        return {
            point1,
            point2,
            point3,
            point4,
            rAngle: angle,
            trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || []
        };
    }
}

MeasurementReport.registerTool(Angle);

export default Angle;
