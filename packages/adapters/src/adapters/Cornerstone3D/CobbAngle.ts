import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";

const { CobbAngle: TID300CobbAngle } = utilities.TID300;

class CobbAngle extends BaseAdapter3D {
    static {
        this.init("CobbAngle", TID300CobbAngle);
        // Register using the Cornerstone 1.x name so this tool is used to load it
        this.registerLegacy();
    }

    // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
    public static getMeasurementData(
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
            CobbAngle.toolType
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
                    angle: NUMGroup
                        ? NUMGroup.MeasuredValueSequence.NumericValue
                        : null
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

    public static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;

        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error(
                "CobbAngle.getTID300RepresentationArguments: referencedImageId is not defined"
            );
        }

        const start1 = worldToImageCoords(referencedImageId, handles.points[0]);
        const end1 = worldToImageCoords(referencedImageId, handles.points[1]);

        const start2 = worldToImageCoords(referencedImageId, handles.points[2]);
        const end2 = worldToImageCoords(referencedImageId, handles.points[3]);

        const point1 = { x: start1[0], y: start1[1] };
        const point2 = { x: end1[0], y: end1[1] };
        const point3 = { x: start2[0], y: start2[1] };
        const point4 = { x: end2[0], y: end2[1] };

        const { angle } = cachedStats[`imageId:${referencedImageId}`] || {};

        return {
            point1,
            point2,
            point3,
            point4,
            rAngle: angle,
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

export default CobbAngle;
