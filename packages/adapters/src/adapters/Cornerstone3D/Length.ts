import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";

const { Length: TID300Length } = utilities.TID300;

const LENGTH = "Length";

export default class Length extends BaseAdapter3D {
    static {
        this.init(LENGTH, TID300Length);
        // Register using the Cornerstone 1.x name so this tool is used to load it
        this.registerLegacy();
    }

    // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
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
            this.toolType
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
                points: [worldCoords[0], worldCoords[1]],
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            },
            cachedStats: {
                [`imageId:${referencedImageId}`]: {
                    length: NUMGroup
                        ? NUMGroup.MeasuredValueSequence.NumericValue
                        : 0
                }
            },
            frameNumber: ReferencedFrameNumber
        };

        return super.addTextBoxDataToState({
            state,
            TextBoxGroup,
            imageToWorldCoords,
            referencedImageId
        });
    }

    static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;

        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error(
                "Length.getTID300RepresentationArguments: referencedImageId is not defined"
            );
        }

        const start = worldToImageCoords(referencedImageId, handles.points[0]);
        const end = worldToImageCoords(referencedImageId, handles.points[1]);

        const point1 = { x: start[0], y: start[1] };
        const point2 = { x: end[0], y: end[1] };

        const { length: distance } =
            cachedStats[`imageId:${referencedImageId}`] || {};

        return {
            point1,
            point2,
            distance,
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
