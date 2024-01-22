import { utilities } from "dcmjs";
import CORNERSTONE_3D_TAG from "./cornerstone3DTag";
import MeasurementReport from "./MeasurementReport";

const { Length: TID300Length } = utilities.TID300;

const ULTRASOUND_DIRECTIONAL = "UltrasoundDirectionalTool";
const trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${ULTRASOUND_DIRECTIONAL}`;

class UltrasoundDirectional {
    public static toolType = ULTRASOUND_DIRECTIONAL;
    public static utilityToolType = ULTRASOUND_DIRECTIONAL;
    public static TID300Representation = TID300Length;
    public static isValidCornerstoneTrackingIdentifier = TrackingIdentifier => {
        if (!TrackingIdentifier.includes(":")) {
            return false;
        }

        const [cornerstone3DTag, toolType] = TrackingIdentifier.split(":");

        if (cornerstone3DTag !== CORNERSTONE_3D_TAG) {
            return false;
        }

        return toolType === ULTRASOUND_DIRECTIONAL;
    };

    // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
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
                UltrasoundDirectional.toolType
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
            cachedStats: {},
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const { data, finding, findingSites, metadata } = tool;
        const { handles } = data;

        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error(
                "UltrasoundDirectionalTool.getTID300RepresentationArguments: referencedImageId is not defined"
            );
        }

        const start = worldToImageCoords(referencedImageId, handles.points[0]);
        const end = worldToImageCoords(referencedImageId, handles.points[1]);

        const point1 = { x: start[0], y: start[1] };
        const point2 = { x: end[0], y: end[1] };

        return {
            point1,
            point2,
            trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || []
        };
    }
}

MeasurementReport.registerTool(UltrasoundDirectional);

export default UltrasoundDirectional;
