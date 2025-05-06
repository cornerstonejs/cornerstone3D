import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";

const { Circle: TID300Circle } = utilities.TID300;

class CircleROI extends BaseAdapter3D {
    static {
        this.init("CircleROI", TID300Circle);
        this.registerLegacy();
    }

    /** Gets the measurement data for cornerstone, given DICOM SR measurement data. */
    static getMeasurementData(
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
            CircleROI.toolType
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

        // GraphicData is ordered as [centerX, centerY, endX, endY]
        const pointsWorld = [];
        for (let i = 0; i < GraphicData.length; i += 2) {
            const worldPos = imageToWorldCoords(referencedImageId, [
                GraphicData[i],
                GraphicData[i + 1]
            ]);

            pointsWorld.push(worldPos);
        }

        const state = defaultState;

        state.annotation.data = {
            handles: {
                points: [...pointsWorld],
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            },
            cachedStats: {
                [`imageId:${referencedImageId}`]: {
                    area: NUMGroup
                        ? NUMGroup.MeasuredValueSequence.NumericValue
                        : 0,
                    // Dummy values to be updated by cornerstone
                    radius: 0,
                    perimeter: 0
                }
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getMeasurementDataFromScoord3D({ defaultState, SCOORD3DGroup }) {
        const { GraphicData } = SCOORD3DGroup;

        // GraphicData is ordered as [centerX, centerY, endX, endY]
        const pointsWorld = [];
        for (let i = 0; i < GraphicData.length; i += 3) {
            const worldPos = [
                GraphicData[i],
                GraphicData[i + 1],
                GraphicData[i + 2]
            ];

            pointsWorld.push(worldPos);
        }

        const state = defaultState;

        state.annotation.data = {
            handles: {
                points: [...pointsWorld],
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            },
            cachedStats: {}
        };

        return state;
    }

    /**
     * Gets the TID 300 representation of a circle, given the cornerstone representation.
     *
     * @param {Object} tool
     * @returns
     */
    static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;

        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            return this.getTID300RepresentationArgumentsSCOORD3D(tool);
        }

        // Using image coordinates for 2D points
        const center = worldToImageCoords(referencedImageId, handles.points[0]);
        const end = worldToImageCoords(referencedImageId, handles.points[1]);

        const points = [];
        points.push({ x: center[0], y: center[1] });
        points.push({ x: end[0], y: end[1] });

        const { area, radius } =
            cachedStats[`imageId:${referencedImageId}`] || {};
        const perimeter = 2 * Math.PI * radius;

        return {
            area,
            perimeter,
            radius,
            points,
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || [],
            use3DSpatialCoordinates: false
        };
    }

    static getTID300RepresentationArgumentsSCOORD3D(tool) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;

        // Using world coordinates for 3D points
        const center = handles.points[0];
        const end = handles.points[1];

        const points = [];
        points.push({ x: center[0], y: center[1], z: center[2] });
        points.push({ x: end[0], y: end[1], z: center[2] });

        const cachedStatsKeys = Object.keys(cachedStats)[0];
        const { area, radius } = cachedStatsKeys
            ? cachedStats[cachedStatsKeys]
            : {};
        const perimeter = 2 * Math.PI * radius;

        return {
            area,
            perimeter,
            radius,
            points,
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || [],
            ReferencedFrameOfReferenceUID: metadata.FrameOfReferenceUID,
            use3DSpatialCoordinates: true
        };
    }
}

export default CircleROI;
