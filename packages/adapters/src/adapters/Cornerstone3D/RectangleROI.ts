import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";

const { Polyline: TID300Polyline } = utilities.TID300;

class RectangleROI extends BaseAdapter3D {
    static {
        this.init("RectangleROI", TID300Polyline);
        // Register using the Cornerstone 1.x name so this tool is used to load it
        this.registerLegacy();
    }
    public static getMeasurementData(
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
                RectangleROI.toolType
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

        const state = defaultState;

        state.annotation.data = {
            handles: {
                points: [
                    worldCoords[0],
                    worldCoords[1],
                    worldCoords[3],
                    worldCoords[2]
                ],
                activeHandleIndex: 0,
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
        const { cachedStats = {}, handles } = data;

        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error(
                "CobbAngle.getTID300RepresentationArguments: referencedImageId is not defined"
            );
        }

        const corners = handles.points.map(point =>
            worldToImageCoords(referencedImageId, point)
        );

        const { area, perimeter } = cachedStats;

        return {
            points: [
                corners[0],
                corners[1],
                corners[3],
                corners[2],
                corners[0]
            ],
            area,
            perimeter,
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || []
        };
    }
}

export default RectangleROI;
