import MeasurementReport from "./MeasurementReport";
import { utilities } from "dcmjs";
import { vec3 } from "gl-matrix";
import BaseAdapter3D from "./BaseAdapter3D";

const { Polyline: TID300Polyline } = utilities.TID300;

class PlanarFreehandROI extends BaseAdapter3D {
    public static closedContourThreshold = 1e-5;

    static {
        this.init("PlanarFreehandROI", TID300Polyline);
    }

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
                PlanarFreehandROI.toolType
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

        const distanceBetweenFirstAndLastPoint = vec3.distance(
            worldCoords[worldCoords.length - 1],
            worldCoords[0]
        );

        let isOpenContour = true;

        // If the contour is closed, this should have been encoded as exactly the same point, so check for a very small difference.
        if (distanceBetweenFirstAndLastPoint < this.closedContourThreshold) {
            worldCoords.pop(); // Remove the last element which is duplicated.

            isOpenContour = false;
        }

        const points = [];

        if (isOpenContour) {
            points.push(worldCoords[0], worldCoords[worldCoords.length - 1]);
        }

        const state = defaultState;

        state.annotation.data = {
            contour: { polyline: worldCoords, closed: !isOpenContour },
            handles: {
                points,
                activeHandleIndex: null,
                textBox: {
                    hasMoved: false
                }
            },
            cachedStats: {
                [`imageId:${referencedImageId}`]: {
                    area: NUMGroup
                        ? NUMGroup.MeasuredValueSequence.NumericValue
                        : null
                }
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const { data, finding, findingSites, metadata } = tool;

        const { polyline, closed } = data.contour;
        const isOpenContour = closed !== true;

        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            return this.getTID300RepresentationArgumentsSCOORD3D(tool);
        }

        // Using image coordinates for 2D points
        const points = polyline.map(worldPos =>
            worldToImageCoords(referencedImageId, worldPos)
        );

        if (!isOpenContour) {
            // Need to repeat the first point at the end of to have an explicitly closed contour.
            const firstPoint = points[0];

            // Explicitly expand to avoid circular references.
            points.push([firstPoint[0], firstPoint[1]]);
        }

        const { area, areaUnit, modalityUnit, perimeter, mean, max, stdDev } =
            data.cachedStats[`imageId:${referencedImageId}`] || {};

        return {
            /** From cachedStats */
            points,
            area,
            areaUnit,
            perimeter,
            modalityUnit,
            mean,
            max,
            stdDev,
            /** Other */
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || [],
            use3DSpatialCoordinates: false
        };
    }

    static getTID300RepresentationArgumentsSCOORD3D(tool) {
        const { data, finding, findingSites, metadata } = tool;

        const { polyline, closed } = data.contour;
        const isOpenContour = closed !== true;

        // Using world coordinates for 3D points
        const points = polyline;

        if (!isOpenContour) {
            // Need to repeat the first point at the end of to have an explicitly closed contour.
            const firstPoint = points[0];

            // Explicitly expand to avoid circular references.
            points.push([firstPoint[0], firstPoint[1], firstPoint[2]]);
        }

        const cachedStatsKeys = Object.keys(data.cachedStats)[0];
        const { area, areaUnit, modalityUnit, perimeter, mean, max, stdDev } =
            cachedStatsKeys ? data.cachedStats[cachedStatsKeys] : {};

        return {
            /** From cachedStats */
            points,
            area,
            areaUnit,
            perimeter,
            modalityUnit,
            mean,
            max,
            stdDev,
            /** Other */
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || [],
            ReferencedFrameOfReferenceUID: metadata.FrameOfReferenceUID,
            use3DSpatialCoordinates: true
        };
    }
}

export default PlanarFreehandROI;
