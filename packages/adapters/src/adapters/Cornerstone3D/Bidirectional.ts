import { utilities } from "dcmjs";
import CORNERSTONE_3D_TAG from "./cornerstone3DTag";
import MeasurementReport from "./MeasurementReport";
import { toArray } from "../helpers";
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
        imageToWorldCoords,
        metadata
    ) {
        const { defaultState, ReferencedFrameNumber } =
            MeasurementReport.getSetupMeasurementData(
                MeasurementGroup,
                sopInstanceUIDToImageIdMap,
                metadata,
                Bidirectional.toolType
            );

        const referencedImageId =
            defaultState.annotation.metadata.referencedImageId;
        const { ContentSequence } = MeasurementGroup;

        const longAxisNUMGroup = toArray(ContentSequence).find(
            group => group.ConceptNameCodeSequence.CodeMeaning === LONG_AXIS
        );

        const longAxisSCOORDGroup = toArray(
            longAxisNUMGroup.ContentSequence
        ).find(group => group.ValueType === "SCOORD");

        const shortAxisNUMGroup = toArray(ContentSequence).find(
            group => group.ConceptNameCodeSequence.CodeMeaning === SHORT_AXIS
        );

        const shortAxisSCOORDGroup = toArray(
            shortAxisNUMGroup.ContentSequence
        ).find(group => group.ValueType === "SCOORD");

        const worldCoords = [];

        [longAxisSCOORDGroup, shortAxisSCOORDGroup].forEach(group => {
            const { GraphicData } = group;
            for (let i = 0; i < GraphicData.length; i += 2) {
                const point = imageToWorldCoords(referencedImageId, [
                    GraphicData[i],
                    GraphicData[i + 1]
                ]);
                worldCoords.push(point);
            }
        });

        const state = defaultState;

        state.annotation.data = {
            handles: {
                points: [
                    worldCoords[0],
                    worldCoords[1],
                    worldCoords[2],
                    worldCoords[3]
                ],
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            },
            cachedStats: {
                [`imageId:${referencedImageId}`]: {
                    length: longAxisNUMGroup.MeasuredValueSequence.NumericValue,
                    width: shortAxisNUMGroup.MeasuredValueSequence.NumericValue
                }
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;

        const { referencedImageId } = metadata;

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

        if (!referencedImageId) {
            return this.getTID300RepresentationArgumentsSCOORD3D({
                tool,
                shortAxisPoints,
                longAxisPoints
            });
        }

        // Using image coordinates for 2D points
        const longAxisStartImage = worldToImageCoords(
            referencedImageId,
            shortAxisPoints[0]
        );
        const longAxisEndImage = worldToImageCoords(
            referencedImageId,
            shortAxisPoints[1]
        );
        const shortAxisStartImage = worldToImageCoords(
            referencedImageId,
            longAxisPoints[0]
        );
        const shortAxisEndImage = worldToImageCoords(
            referencedImageId,
            longAxisPoints[1]
        );

        const { length, width } =
            cachedStats[`imageId:${referencedImageId}`] || {};

        return {
            longAxis: {
                point1: {
                    x: longAxisStartImage[0],
                    y: longAxisStartImage[1]
                },
                point2: {
                    x: longAxisEndImage[0],
                    y: longAxisEndImage[1]
                }
            },
            shortAxis: {
                point1: {
                    x: shortAxisStartImage[0],
                    y: shortAxisStartImage[1]
                },
                point2: {
                    x: shortAxisEndImage[0],
                    y: shortAxisEndImage[1]
                }
            },
            longAxisLength: length,
            shortAxisLength: width,
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding: finding,
            findingSites: findingSites || [],
            use3DSpatialCoordinates: false
        };
    }

    static getTID300RepresentationArgumentsSCOORD3D({
        tool,
        shortAxisPoints,
        longAxisPoints
    }) {
        const { data, finding, findingSites } = tool;
        const { cachedStats = {} } = data;

        // Using world coordinates for 3D points
        const longAxisStart = shortAxisPoints[0];
        const longAxisEnd = shortAxisPoints[1];
        const shortAxisStart = longAxisPoints[0];
        const shortAxisEnd = longAxisPoints[1];

        const cachedStatsKeys = Object.keys(cachedStats)[0];
        const { length, width } = cachedStatsKeys
            ? cachedStats[cachedStatsKeys]
            : {};

        return {
            longAxis: {
                point1: {
                    x: longAxisStart[0],
                    y: longAxisStart[1],
                    z: longAxisStart[2]
                },
                point2: {
                    x: longAxisEnd[0],
                    y: longAxisEnd[1],
                    z: longAxisEnd[2]
                }
            },
            shortAxis: {
                point1: {
                    x: shortAxisStart[0],
                    y: shortAxisStart[1],
                    z: shortAxisStart[2]
                },
                point2: {
                    x: shortAxisEnd[0],
                    y: shortAxisEnd[1],
                    z: shortAxisEnd[2]
                }
            },
            longAxisLength: length,
            shortAxisLength: width,
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding: finding,
            findingSites: findingSites || [],
            use3DSpatialCoordinates: true
        };
    }
}

export default Bidirectional;
