import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";

const { CobbAngle: TID300CobbAngle } = utilities.TID300;

class Angle extends BaseAdapter3D {
    static {
        this.init("Angle", TID300CobbAngle);
        this.registerLegacy();
    }

    // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
    public static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        imageToWorldCoords,
        metadata
    ) {
        const {
            defaultState,
            NUMGroup,
            SCOORDGroup,
            SCOORD3DGroup,
            ReferencedFrameNumber
        } = MeasurementReport.getSetupMeasurementData(
            MeasurementGroup,
            sopInstanceUIDToImageIdMap,
            metadata,
            Angle.toolType
        );
        if (SCOORDGroup) {
            return this.getMeasurementDataFromScoord({
                defaultState,
                SCOORDGroup,
                imageToWorldCoords,
                NUMGroup,
                ReferencedFrameNumber
            });
        } else if (SCOORD3DGroup) {
            return this.getMeasurementDataFromScoord3D({
                defaultState,
                SCOORD3DGroup
            });
        } else {
            throw new Error(
                "Can't get measurement data with missing SCOORD and SCOORD3D groups."
            );
        }
    }

    static getMeasurementDataFromScoord({
        defaultState,
        SCOORDGroup,
        imageToWorldCoords,
        NUMGroup,
        ReferencedFrameNumber
    }) {
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

    static getMeasurementDataFromScoord3D({ defaultState, SCOORD3DGroup }) {
        const { GraphicData } = SCOORD3DGroup;
        const worldCoords = [];
        for (let i = 0; i < GraphicData.length; i += 3) {
            const point = [
                GraphicData[i],
                GraphicData[i + 1],
                GraphicData[i + 2]
            ];
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
            cachedStats: {}
        };

        return state;
    }

    public static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;

        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            return this.getTID300RepresentationArgumentsSCOORD3D(tool);
        }

        // Using image coordinates for 2D points
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
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || [],
            use3DSpatialCoordinates: false
        };
    }

    public static getTID300RepresentationArgumentsSCOORD3D(tool) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;

        // Using world coordinates for 3D points
        const start = handles.points[0];
        const middle = handles.points[1];
        const end = handles.points[2];

        const point1 = { x: start[0], y: start[1], z: start[2] };
        const point2 = { x: middle[0], y: middle[1], z: middle[2] };
        const point3 = point2;
        const point4 = { x: end[0], y: end[1], z: end[2] };

        const cachedStatsKeys = Object.keys(cachedStats)[0];
        const { angle } = cachedStatsKeys ? cachedStats[cachedStatsKeys] : {};

        return {
            point1,
            point2,
            point3,
            point4,
            rAngle: angle,
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || [],
            ReferencedFrameOfReferenceUID: metadata.FrameOfReferenceUID,
            use3DSpatialCoordinates: true
        };
    }
}

export default Angle;
