import { vec3 } from "gl-matrix";
import { utilities } from "dcmjs";
import { utilities as csUtilities } from "@cornerstonejs/core";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";

type Point3 = [number, number, number];

const { Ellipse: TID300Ellipse } = utilities.TID300;
const { worldToImageCoords } = csUtilities;

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

        const [majorAxisStart, majorAxisEnd, minorAxisStart, minorAxisEnd] =
            worldCoords;

        const majorAxisVec = vec3.create();
        vec3.sub(majorAxisVec, majorAxisEnd, majorAxisStart);

        // normalize majorAxisVec to avoid scaling issues
        vec3.normalize(majorAxisVec, majorAxisVec);

        const minorAxisVec = vec3.create();
        vec3.sub(minorAxisVec, minorAxisEnd, minorAxisStart);
        vec3.normalize(minorAxisVec, minorAxisVec);

        const imagePlaneModule = metadata.get(
            "imagePlaneModule",
            referencedImageId
        );

        if (!imagePlaneModule) {
            throw new Error("imageId does not have imagePlaneModule metadata");
        }

        const { columnCosines } = imagePlaneModule;

        // find which axis is parallel to the columnCosines
        const columnCosinesVec = vec3.fromValues(
            columnCosines[0],
            columnCosines[1],
            columnCosines[2]
        );
        const projectedMajorAxisOnColVec = vec3.dot(
            columnCosinesVec,
            majorAxisVec
        );

        const projectedMinorAxisOnColVec = vec3.dot(
            columnCosinesVec,
            minorAxisVec
        );

        const absoluteOfMajorDotProduct = Math.abs(projectedMajorAxisOnColVec);
        const absoluteOfMinorDotProduct = Math.abs(projectedMinorAxisOnColVec);

        let ellipsePoints = [];
        if (Math.abs(absoluteOfMajorDotProduct - 1) < EPSILON) {
            ellipsePoints = worldCoords;
        } else if (Math.abs(absoluteOfMinorDotProduct - 1) < EPSILON) {
            ellipsePoints = [
                worldCoords[2],
                worldCoords[3],
                worldCoords[0],
                worldCoords[1]
            ];
        } else {
            console.warn("OBLIQUE ELLIPSE NOT YET SUPPORTED");
            return null;
        }

        state.annotation.data = {
            ...state.annotation.data,
            handles: {
                points: [...ellipsePoints],
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            },
            frameNumber: ReferencedFrameNumber
        };
        if (referencedImageId) {
            state.annotation.data.cachedStats = {
                [`imageId:${referencedImageId}`]: {
                    area: NUMGroup
                        ? NUMGroup.MeasuredValueSequence.NumericValue
                        : 0
                }
            };
        }

        return state;
    }

    static getTID300RepresentationArguments(tool, is3DMeasurement = false) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;
        const rotation = data.initialRotation || 0;
        const { referencedImageId } = metadata;

        let top, bottom, left, right;

        // Using image coordinates for 2D points
        // this way when it's restored we can assume the initial rotation is 0.
        if (rotation == 90 || rotation == 270) {
            bottom = worldToImageCoords(referencedImageId, handles.points[2]);
            top = worldToImageCoords(referencedImageId, handles.points[3]);
            left = worldToImageCoords(referencedImageId, handles.points[0]);
            right = worldToImageCoords(referencedImageId, handles.points[1]);
        } else {
            top = worldToImageCoords(referencedImageId, handles.points[0]);
            bottom = worldToImageCoords(referencedImageId, handles.points[1]);
            left = worldToImageCoords(referencedImageId, handles.points[2]);
            right = worldToImageCoords(referencedImageId, handles.points[3]);
        }

        // find the major axis and minor axis
        const topBottomLength = Math.abs(top.y - bottom.y);
        const leftRightLength = Math.abs(left.x - right.x);

        const points = [];
        if (topBottomLength > leftRightLength) {
            // major axis is bottom to top
            points.push({ x: top[0], y: top[1] });
            points.push({ x: bottom[0], y: bottom[1] });

            // minor axis is left to right
            points.push({ x: left[0], y: left[1] });
            points.push({ x: right[0], y: right[1] });
        } else {
            // major axis is left to right
            points.push({ x: left[0], y: left[1] });
            points.push({ x: right[0], y: right[1] });

            // minor axis is bottom to top
            points.push({ x: top[0], y: top[1] });
            points.push({ x: bottom[0], y: bottom[1] });
        }

        const { area } = cachedStats[`imageId:${referencedImageId}`] || {};

        return {
            area,
            points,
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
