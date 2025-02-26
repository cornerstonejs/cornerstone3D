import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";

const { Point: TID300Point } = utilities.TID300;

class Probe extends BaseAdapter3D {
    static {
        this.init("Probe", TID300Point);
        this.registerLegacy();
    }

    static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        imageToWorldCoords,
        metadata
    ) {
        const state = super.getMeasurementData(
            MeasurementGroup,
            sopInstanceUIDToImageIdMap,
            imageToWorldCoords,
            metadata
        );

        const { defaultState, SCOORDGroup } =
            MeasurementReport.getSetupMeasurementData(
                MeasurementGroup,
                sopInstanceUIDToImageIdMap,
                metadata,
                Probe.toolType
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

        state.annotation.data = {
            ...state.annotation.data,
            handles: {
                points: worldCoords,
                activeHandleIndex: null,
                textBox: {
                    hasMoved: false
                }
            }
        };

        return state;
    }
}

export default Probe;
