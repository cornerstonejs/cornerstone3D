import CORNERSTONE_3D_TAG from "./cornerstone3DTag";
import MeasurementReport from "./MeasurementReport";

/**
 * This is a basic definition of adapters to be inherited for other adapters.
 */
export default class BaseAdapter3D {
    public static toolType: string;
    public static utilityToolType: string;
    public static TID300Representation;
    public static trackingIdentifierTextValue: string;

    /**
     * @returns true if the tool is of the given tool type based on the tracking identifier
     */
    public static isValidCornerstoneTrackingIdentifier = trackingIdentifier => {
        if (!trackingIdentifier.includes(":")) {
            return false;
        }

        const [cornerstone3DTag, toolType] = trackingIdentifier.split(":");

        if (cornerstone3DTag !== CORNERSTONE_3D_TAG) {
            return false;
        }

        return toolType === this.toolType;
    };

    /**
     * Returns annotation data for CS3D to use based on the underlying
     * DICOM SR annotation data.
     */
    public static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        _imageToWorldCoords,
        metadata
    ) {
        const { defaultState: state, ReferencedFrameNumber } =
            MeasurementReport.getSetupMeasurementData(
                MeasurementGroup,
                sopInstanceUIDToImageIdMap,
                metadata,
                this.toolType
            );

        state.annotation.data = {
            cachedStats: {},
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    public static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const { data, metadata } = tool;
        const { finding, findingSites } = tool;
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
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            findingSites: findingSites || [],
            finding
        };

        return TID300RepresentationArguments;
    }
}
