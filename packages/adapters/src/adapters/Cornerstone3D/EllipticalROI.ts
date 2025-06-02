import { vec3 } from "gl-matrix";
import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";
import { scoordToWorld } from "../helpers";

type Point3 = [number, number, number];

const { Ellipse: TID300Ellipse } = utilities.TID300;

const EPSILON = 1e-4;

class EllipticalROI extends BaseAdapter3D {
    static {
        this.init("EllipticalROI", TID300Ellipse);
    }

    static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        imageToWorldCoords,
        metadata
    ) {
        const {
            state,
            NUMGroup,
            SCOORDGroup,
            SCOORD3DGroup,
            ReferencedFrameNumber
        } = MeasurementReport.getSetupMeasurementData(
            MeasurementGroup,
            sopInstanceUIDToImageIdMap,
            metadata,
            EllipticalROI.toolType
        );

        const isMeasurement3d = !!SCOORD3DGroup;
        const scoord = isMeasurement3d ? SCOORD3DGroup : SCOORDGroup;
        const scoordArgs = {
            isMeasurement3d,
            tool: state.annotation,
            imageToWorldCoords
        };

        const referencedImageId = state.annotation.metadata.referencedImageId;

        const worldCoords = scoordToWorld(scoordArgs, scoord);

        const majorAxisStart = vec3.fromValues(...worldCoords[0]);
        const majorAxisEnd = vec3.fromValues(...worldCoords[1]);
        const minorAxisStart = vec3.fromValues(...worldCoords[2]);
        const minorAxisEnd = vec3.fromValues(...worldCoords[3]);

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
            ellipsePoints = scoordToWorld(scoordArgs, pointsWorld);
        } else if (Math.abs(absoluteOfMinorDotProduct - 1) < EPSILON) {
            ellipsePoints = scoordToWorld(scoordArgs, [
                pointsWorld[2],
                pointsWorld[3],
                pointsWorld[0],
                pointsWorld[1]
            ]);
        } else {
            console.warn("OBLIQUE ELLIPSE NOT YET SUPPORTED");
            return null;
        }

        state.annotation.data = {
            handles: {
                points: [...ellipsePoints],
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            },
            cachedStats: {
                [`imageId:${referencedImageId}`]: {
                    area: NUMGroup
                        ? NUMGroup.MeasuredValueSequence.NumericValue
                        : 0
                }
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(
        tool,
        worldToImageCoords,
        is3DMeasurement = false
    ) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;
        const rotation = data.initialRotation || 0;
        const { referencedImageId } = metadata;

        if (is3DMeasurement) {
            return this.getTID300RepresentationArgumentsSCOORD3D(tool);
        }
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
        const topBottomLength = Math.abs(top[1] - bottom[1]);
        const leftRightLength = Math.abs(left[0] - right[0]);

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
            use3DSpatialCoordinates: false
        };
    }

    static getTID300RepresentationArgumentsSCOORD3D(tool) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats, handles } = data;
        const rotation = data.initialRotation || 0;

        let top, bottom, left, right;

        // Using world coordinates for 3D points
        // this way when it's restored we can assume the initial rotation is 0.
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
            points.push({ x: top[0], y: top[1], z: top[2] });
            points.push({ x: bottom[0], y: bottom[1], z: bottom[2] });

            // minor axis is left to right
            points.push({ x: left[0], y: left[1], z: left[2] });
            points.push({ x: right[0], y: right[1], z: right[2] });
        } else {
            // major axis is left to right
            points.push({ x: left[0], y: left[1], z: left[2] });
            points.push({ x: right[0], y: right[1], z: right[2] });

            // minor axis is bottom to top
            points.push({ x: top[0], y: top[1], z: top[2] });
            points.push({ x: bottom[0], y: bottom[1], z: bottom[2] });
        }

        const cachedStatsKeys = Object.keys(cachedStats)[0];
        const { area } = cachedStatsKeys ? cachedStats[cachedStatsKeys] : {};

        return {
            area,
            points,
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || [],
            ReferencedFrameOfReferenceUID: metadata.FrameOfReferenceUID,
            use3DSpatialCoordinates: true
        };
    }
}

export default EllipticalROI;
