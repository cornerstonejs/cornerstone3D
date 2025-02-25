import MeasurementReport from "./MeasurementReport";
import CORNERSTONE_3D_TAG from "./cornerstone3DTag";

import Probe from "./Probe";

const baseTrackingIdentifier = `${CORNERSTONE_3D_TAG}:KeyImage`;

class KeyImage extends Probe {
    public static toolType;

    public static keyPointTracking = `${baseTrackingIdentifier}:Point`;
    public static keySeriesTracking = `${baseTrackingIdentifier}:Series`;
    public static keySeriesPointTracking = `${this.keyPointTracking}:Series`;
    /** A fiducial is a name some CS3D customizations use for KeyImages */
    public static fiducialTracking = `${CORNERSTONE_3D_TAG}:Fiducial`;

    static {
        const alternateTrackingIdentifiers = [
            this.keyPointTracking,
            this.keySeriesPointTracking,
            this.keySeriesTracking,
            this.fiducialTracking
        ];
        this.init("KeyImage", {
            alternateTrackingIdentifiers
        });
    }

    static getMeasurementData(
        measurementGroup,
        sopInstanceUIDToImageIdMap,
        imageToWorldCoords,
        metadata
    ) {
        const state = super.getMeasurementData(
            measurementGroup,
            sopInstanceUIDToImageIdMap,
            imageToWorldCoords,
            metadata
        );

        const { defaultState, SCOORDGroup } =
            MeasurementReport.getSetupMeasurementData(
                measurementGroup,
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

export default KeyImage;
export { KeyImage };
