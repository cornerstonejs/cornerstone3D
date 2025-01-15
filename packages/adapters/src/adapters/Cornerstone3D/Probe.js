import { utilities } from "dcmjs";
import CORNERSTONE_3D_TAG from "./cornerstone3DTag";
import MeasurementReport from "./MeasurementReport";

const { Point: TID300Point } = utilities.TID300;

const PROBE = "Probe";
const trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${PROBE}`;

class Probe {
    static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        imageToWorldCoords,
        metadata
    ) {
        const { defaultState, SCOORDGroup, ReferencedFrameNumber } =
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

        const state = defaultState;

        state.annotation.data = {
            handles: {
                points: worldCoords,
                activeHandleIndex: null,
                textBox: {
                    hasMoved: false
                }
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const { data, metadata } = tool;
        let { finding, findingSites } = tool;
        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error(
                "Probe.getTID300RepresentationArguments: referencedImageId is not defined"
            );
        }

        const { points } = data.handles;

        const pointsImage = points.map(point => {
            const pointImage = worldToImageCoords(referencedImageId, point);
            return {
                x: pointImage[0],
                y: pointImage[1]
            };
        });

        const TID300RepresentationArguments = {
            points: pointsImage,
            trackingIdentifierTextValue,
            findingSites: findingSites || [],
            finding
        };

        return TID300RepresentationArguments;
    }
}

Probe.toolType = PROBE;
Probe.utilityToolType = PROBE;
Probe.TID300Representation = TID300Point;
Probe.isValidCornerstoneTrackingIdentifier = TrackingIdentifier => {
    if (!TrackingIdentifier.includes(":")) {
        return false;
    }

    const [cornerstone3DTag, toolType] = TrackingIdentifier.split(":");

    if (cornerstone3DTag !== CORNERSTONE_3D_TAG) {
        return false;
    }

    return toolType === PROBE;
};

MeasurementReport.registerTool(Probe);

export default Probe;
