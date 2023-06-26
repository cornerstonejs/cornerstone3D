import { utilities } from "dcmjs";
import CORNERSTONE_3D_TAG from "./cornerstone3DTag";
import MeasurementReport from "./MeasurementReport";

const { Calibration: TID300Calibration } = utilities.TID300;

const CALIBRATION = "CalibrationLine";
const trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${CALIBRATION}`;

console.log(
    "********* Loading calibration adapter",
    trackingIdentifierTextValue
);

class Calibration {
    static toolType = CALIBRATION;
    static utilityToolType = CALIBRATION;
    static TID300Representation = TID300Calibration;
    static isValidCornerstoneTrackingIdentifier(TrackingIdentifier) {
        if (!TrackingIdentifier.includes(":")) {
            return false;
        }

        const [cornerstone3DTag, toolType] = TrackingIdentifier.split(":");

        if (cornerstone3DTag !== CORNERSTONE_3D_TAG) {
            return false;
        }

        return toolType === CALIBRATION;
    }

    static getMeasurementData(
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
                Calibration.toolType
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

        console.log(
            "*********** Calibration adapter.getMeasurementData",
            NUMGroup?.MeasuredValueSequence?.NumericValue
        );
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
                    length: NUMGroup?.MeasuredValueSequence?.NumericValue
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
                "Length.getTID300RepresentationArguments: referencedImageId is not defined"
            );
        }

        const start = worldToImageCoords(referencedImageId, handles.points[0]);
        const end = worldToImageCoords(referencedImageId, handles.points[1]);

        const point1 = { x: start[0], y: start[1] };
        const point2 = { x: end[0], y: end[1] };

        const { length: distance, unit } =
            cachedStats[`imageId:${referencedImageId}`] || {};

        return {
            point1,
            point2,
            distance,
            unit,
            trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || []
        };
    }
}

MeasurementReport.registerTool(Calibration);

export default Calibration;
