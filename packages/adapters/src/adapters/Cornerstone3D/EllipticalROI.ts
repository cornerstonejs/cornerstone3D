import { vec3 } from "gl-matrix";
import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";

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
            defaultState,
            NUMGroup,
            SCOORDGroup,
            ReferencedFrameNumber,
            TextBoxGroup
        } = MeasurementReport.getSetupMeasurementData(
            MeasurementGroup,
            sopInstanceUIDToImageIdMap,
            metadata,
            EllipticalROI.toolType
        );

        const referencedImageId =
            defaultState.annotation.metadata.referencedImageId;

        const { GraphicData } = SCOORDGroup;

        // GraphicData is ordered as [majorAxisStartX, majorAxisStartY, majorAxisEndX, majorAxisEndY, minorAxisStartX, minorAxisStartY, minorAxisEndX, minorAxisEndY]
        // But Cornerstone3D points are ordered as top, bottom, left, right for the
        // ellipse so we need to identify if the majorAxis is horizontal or vertical
        // in the image plane and then choose the correct points to use for the ellipse.
        const pointsWorld: Point3[] = [];
        for (let i = 0; i < GraphicData.length; i += 2) {
            const worldPos = imageToWorldCoords(referencedImageId, [
                GraphicData[i],
                GraphicData[i + 1]
            ]);

            pointsWorld.push(worldPos);
        }

        const majorAxisStart = vec3.fromValues(...pointsWorld[0]);
        const majorAxisEnd = vec3.fromValues(...pointsWorld[1]);
        const minorAxisStart = vec3.fromValues(...pointsWorld[2]);
        const minorAxisEnd = vec3.fromValues(...pointsWorld[3]);

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
            ellipsePoints = [
                pointsWorld[0],
                pointsWorld[1],
                pointsWorld[2],
                pointsWorld[3]
            ];
        } else if (Math.abs(absoluteOfMinorDotProduct - 1) < EPSILON) {
            ellipsePoints = [
                pointsWorld[2],
                pointsWorld[3],
                pointsWorld[0],
                pointsWorld[1]
            ];
        } else {
            console.warn("OBLIQUE ELLIPSE NOT YET SUPPORTED");
        }

        const state = defaultState;

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

        return this.addTextBoxDataToState({
            state,
            referencedImageId,
            imageToWorldCoords,
            TextBoxGroup
        });
    }

    static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;
        const rotation = data.initialRotation || 0;
        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error(
                "EllipticalROI.getTID300RepresentationArguments: referencedImageId is not defined"
            );
        }
        let top, bottom, left, right;
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
            textBoxPoint: this.getTextBoxPoint({
                handles,
                referencedImageId,
                worldToImageCoords
            })
        };
    }
}

export default EllipticalROI;
