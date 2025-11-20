import MeasurementReport from "./MeasurementReport";
import { utilities } from "dcmjs";
import { vec3 } from "gl-matrix";
import BaseAdapter3D from "./BaseAdapter3D";
import { toScoords } from "../helpers";
import { extractAllNUMGroups, restoreAdditionalMetrics } from "./metricHandler";

const { Polyline: TID300Polyline } = utilities.TID300;

class PlanarFreehandROI extends BaseAdapter3D {
    public static closedContourThreshold = 1e-5;

    static {
        this.init("PlanarFreehandROI", TID300Polyline);
    }

    static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        metadata
    ) {
        const {
            state,
            NUMGroup,
            worldCoords,
            referencedImageId,
            ReferencedFrameNumber
        } = MeasurementReport.getSetupMeasurementData(
            MeasurementGroup,
            sopInstanceUIDToImageIdMap,
            metadata,
            this.toolType
        );

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
        const referencedSOPInstanceUID = state.sopInstanceUid;
        const allNUMGroups = extractAllNUMGroups(
            MeasurementGroup,
            referencedSOPInstanceUID
        );
        const measurementNUMGroups =
            allNUMGroups[referencedSOPInstanceUID] || {};
        state.annotation.data = {
            ...state.annotation.data,
            contour: { polyline: worldCoords, closed: !isOpenContour },
            handles: {
                ...state.annotation.data.handles,
                points
            },
            frameNumber: ReferencedFrameNumber
        };

        if (referencedImageId) {
            state.annotation.data.cachedStats = {
                [`imageId:${referencedImageId}`]: {
                    area: NUMGroup
                        ? NUMGroup.MeasuredValueSequence.NumericValue
                        : null,
                    ...restoreAdditionalMetrics(measurementNUMGroups)
                }
            };
        }
        return state;
    }

    static getTID300RepresentationArguments(tool, is3DMeasurement = false) {
        const { data, finding, findingSites, metadata } = tool;

        const { polyline, closed } = data.contour;
        const isOpenContour = closed !== true;

        const { referencedImageId } = metadata;
        const scoordProps = {
            is3DMeasurement,
            referencedImageId
        };

        const points = toScoords(scoordProps, polyline);

        if (!isOpenContour) {
            // Need to repeat the first point at the end of to have an explicitly closed contour.
            const firstPoint = points[0];
            points.push(firstPoint);
        }

        const {
            area,
            areaUnit,
            modalityUnit,
            perimeter,
            mean,
            max,
            stdDev,
            length
        } = data.cachedStats[`imageId:${referencedImageId}`] || {};

        return {
            /** From cachedStats */
            points,
            area,
            areaUnit,
            perimeter: perimeter ?? length,
            modalityUnit,
            mean,
            max,
            stdDev,
            /** Other */
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || [],
            ReferencedFrameOfReferenceUID: is3DMeasurement
                ? metadata.FrameOfReferenceUID
                : null,
            use3DSpatialCoordinates: is3DMeasurement
        };
    }
}

export default PlanarFreehandROI;
