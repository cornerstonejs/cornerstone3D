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
        const { defaultState, NUMGroup, SCOORDGroup, ReferencedFrameNumber } =
            MeasurementReport.getSetupMeasurementData(
                MeasurementGroup,
                sopInstanceUIDToImageIdMap,
                metadata,
                CircleROI.toolType
            );

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
            throw new Error(
                "CircleROI.getTID300RepresentationArguments: referencedImageId is not defined"
            );
        }

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
            findingSites: findingSites || []
        };
    }
}

export default CircleROI;
