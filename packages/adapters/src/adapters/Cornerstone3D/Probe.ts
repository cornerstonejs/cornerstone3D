import { utilities } from "dcmjs";
import CORNERSTONE_3D_TAG from "./cornerstone3DTag";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";

const { Point: TID300Point } = utilities.TID300;

const PROBE = "Probe";
const trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${PROBE}`;

class Probe extends BaseAdapter3D {
    public static toolType = PROBE;
    public static utilityToolType = PROBE;
    public static TID300Representation = TID300Point;

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

MeasurementReport.registerTool(Probe);

export default Probe;
