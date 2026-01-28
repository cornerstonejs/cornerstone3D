import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import { scoordToWorld, toScoord, toArray } from "../helpers";
import BaseAdapter3D from "./BaseAdapter3D";

const { Bidirectional: TID300Bidirectional } = utilities.TID300;

const LONG_AXIS = "Long Axis";
const SHORT_AXIS = "Short Axis";

class Bidirectional extends BaseAdapter3D {
    static {
        this.init("Bidirectional", TID300Bidirectional);
        this.registerLegacy();
    }

    public static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        metadata
    ) {
        const { state, scoordArgs, referencedImageId, ReferencedFrameNumber } =
            MeasurementReport.getSetupMeasurementData(
                MeasurementGroup,
                sopInstanceUIDToImageIdMap,
                metadata,
                this.toolType
            );

        const { ContentSequence } = MeasurementGroup;

        const longAxisNUMGroup = toArray(ContentSequence).find(
            group => group.ConceptNameCodeSequence.CodeMeaning === LONG_AXIS
        );

        const shortAxisNUMGroup = toArray(ContentSequence).find(
            group => group.ConceptNameCodeSequence.CodeMeaning === SHORT_AXIS
        );
        const longAxisScoordGroup = toArray(
            longAxisNUMGroup.ContentSequence
        ).find(
            group =>
                group.ValueType === "SCOORD3D" || group.ValueType === "SCOORD"
        );

        const shortAxisScoordGroup = toArray(
            shortAxisNUMGroup.ContentSequence
        ).find(
            group =>
                group.ValueType === "SCOORD3D" || group.ValueType === "SCOORD"
        );

        const worldCoords = [];

        worldCoords.push(...scoordToWorld(scoordArgs, longAxisScoordGroup));
        worldCoords.push(...scoordToWorld(scoordArgs, shortAxisScoordGroup));

        state.annotation.data = {
            ...state.annotation.data,
            handles: {
                ...state.annotation.data.handles,
                points: [
                    worldCoords[0],
                    worldCoords[1],
                    worldCoords[2],
                    worldCoords[3]
                ]
            },
            frameNumber: ReferencedFrameNumber
        };

        if (referencedImageId) {
            state.annotation.data.cachedStats = {
                [`imageId:${referencedImageId}`]: {
                    length: longAxisNUMGroup.MeasuredValueSequence.NumericValue,
                    width: shortAxisNUMGroup.MeasuredValueSequence.NumericValue,
                    unit: longAxisNUMGroup.MeasuredValueSequence
                        .MeasurementUnitsCodeSequence.CodeValue,
                    widthUnit:
                        shortAxisNUMGroup.MeasuredValueSequence
                            .MeasurementUnitsCodeSequence.CodeValue
                }
            };
        }

        return state;
    }

    static getTID300RepresentationArguments(tool, is3DMeasurement = false) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;

        const { referencedImageId } = metadata;
        const scoordProps = {
            is3DMeasurement,
            referencedImageId
        };
        const { points } = handles;

        // Find the length and width point pairs by comparing the distances of the points at 0,1 to points at 2,3
        const firstPointPairs = [points[0], points[1]];
        const secondPointPairs = [points[2], points[3]];

        const firstPointPairsDistance = Math.sqrt(
            Math.pow(firstPointPairs[0][0] - firstPointPairs[1][0], 2) +
                Math.pow(firstPointPairs[0][1] - firstPointPairs[1][1], 2) +
                Math.pow(firstPointPairs[0][2] - firstPointPairs[1][2], 2)
        );

        const secondPointPairsDistance = Math.sqrt(
            Math.pow(secondPointPairs[0][0] - secondPointPairs[1][0], 2) +
                Math.pow(secondPointPairs[0][1] - secondPointPairs[1][1], 2) +
                Math.pow(secondPointPairs[0][2] - secondPointPairs[1][2], 2)
        );

        let shortAxisPoints;
        let longAxisPoints;
        if (firstPointPairsDistance > secondPointPairsDistance) {
            shortAxisPoints = firstPointPairs;
            longAxisPoints = secondPointPairs;
        } else {
            shortAxisPoints = secondPointPairs;
            longAxisPoints = firstPointPairs;
        }

        // Using image coordinates for 2D points
        const longAxisStartImage = toScoord(scoordProps, shortAxisPoints[0]);
        const longAxisEndImage = toScoord(scoordProps, shortAxisPoints[1]);
        const shortAxisStartImage = toScoord(scoordProps, longAxisPoints[0]);
        const shortAxisEndImage = toScoord(scoordProps, longAxisPoints[1]);

        const { length, width, unit } =
            cachedStats[`imageId:${referencedImageId}`] || {};

        return {
            longAxis: {
                point1: longAxisStartImage,
                point2: longAxisEndImage
            },
            shortAxis: {
                point1: shortAxisStartImage,
                point2: shortAxisEndImage
            },
            longAxisLength: length,
            shortAxisLength: width,
            unit,
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding: finding,
            findingSites: findingSites || [],
            ReferencedFrameOfReferenceUID: is3DMeasurement
                ? metadata.FrameOfReferenceUID
                : null,
            use3DSpatialCoordinates: is3DMeasurement
        };
    }
}

export default Bidirectional;
