import { vec3 } from "gl-matrix";
import { utilities } from "dcmjs";

import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";
import { toScoord } from "../helpers";
import { extractAllNUMGroups, restoreAdditionalMetrics } from "./metricHandler";

const { Ellipse: TID300Ellipse } = utilities.TID300;

const EPSILON = 1e-4;

class EllipticalROI extends BaseAdapter3D {
    static {
        this.init("EllipticalROI", TID300Ellipse);
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
            EllipticalROI.toolType
        );
        const referencedSOPInstanceUID = state.sopInstanceUid;
        const allNUMGroups = extractAllNUMGroups(
            MeasurementGroup,
            referencedSOPInstanceUID
        );
        const measurementNUMGroups =
            allNUMGroups[referencedSOPInstanceUID] || {};
        state.annotation.data = {
            ...state.annotation.data,
            handles: {
                ...state.annotation.data.handles,
                points: worldCoords
            },
            frameNumber: ReferencedFrameNumber
        };
        state.annotation.data.cachedStats = referencedImageId
            ? {
                  [`imageId:${referencedImageId}`]: {
                      area: NUMGroup
                          ? NUMGroup.MeasuredValueSequence.NumericValue
                          : 0,
                      ...restoreAdditionalMetrics(measurementNUMGroups)
                  }
              }
            : {};

        return state;
    }

    static getTID300RepresentationArguments(tool, is3DMeasurement = false) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;
        const rotation = data.initialRotation || 0;
        const { referencedImageId } = metadata;
        const scoordProps = {
            is3DMeasurement,
            referencedImageId
        };

        let top, bottom, left, right;

        if (rotation == 90 || rotation == 270) {
            bottom = handles.points[2];
            top = handles.points[3];
            left = handles.points[0];
            right = handles.points[1];
        } else {
            top = handles.points[0];
            bottom = handles.points[1];
            left = handles.points[2];
            right = handles.points[3];
        }

        // find the major axis and minor axis
        const topBottomLength = Math.sqrt(
            (top[0] - bottom[0]) ** 2 +
                (top[1] - bottom[1]) ** 2 +
                (top[2] - bottom[2]) ** 2
        );
        const leftRightLength = Math.sqrt(
            (left[0] - right[0]) ** 2 +
                (left[1] - right[1]) ** 2 +
                (left[2] - right[2]) ** 2
        );

        const points = [];
        if (topBottomLength > leftRightLength) {
            // major axis is bottom to top
            points.push(top, bottom, left, right);
        } else {
            // major axis is left to right
            points.push(left, right, top, bottom);
        }

        const { area, max, min, mean, stdDev, modalityUnit, areaUnit } =
            cachedStats[`imageId:${referencedImageId}`] || {};

        const convertedPoints = points.map(point =>
            toScoord(scoordProps, point)
        );

        return {
            area,
            areaUnit,
            max,
            min,
            mean,
            stdDev,
            modalityUnit,
            points: convertedPoints,
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

export default EllipticalROI;
