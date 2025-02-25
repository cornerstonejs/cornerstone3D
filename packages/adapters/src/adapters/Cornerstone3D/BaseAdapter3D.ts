import CORNERSTONE_3D_TAG from "./cornerstone3DTag";
import MeasurementReport from "./MeasurementReport";

export type AdapterOptions = {
    trackingIdentifierTextValue?: string;
    alternateTrackingIdentifiers?: string[];
    measurementReport?: typeof MeasurementReport;
};

export type AdapterOptionsCopy = AdapterOptions & {
    trackingIdentifierTextValue: string;
};

/**
 * This is a basic definition of adapters to be inherited for other adapters.
 */
export default class BaseAdapter3D {
    public static toolType: string;
    public static utilityToolType: string;
    public static TID300Representation;
    public static trackingIdentifierTextValue: string;
    public static trackingIdentifiers: Set<string>;

    /**
     * Initialize this adapter and register it with the measurement report
     */
    public static init(toolType, options?: AdapterOptions) {
        this.toolType = toolType;
        this.trackingIdentifierTextValue =
            options?.trackingIdentifierTextValue ||
            `${CORNERSTONE_3D_TAG}:${toolType}`;
        this.trackingIdentifiers = new Set();
        this.trackingIdentifiers.add(this.trackingIdentifierTextValue);
        const useMeasurementReport =
            options?.measurementReport || MeasurementReport;
        useMeasurementReport.registerTool(this);
        if (options?.alternateTrackingIdentifiers) {
            useMeasurementReport.registerTrackingIdentifier(
                this,
                ...options.alternateTrackingIdentifiers
            );
        }
    }

    /**
     * Create a copy of the tool that work the same way except deserializing to the
     * new tool instance.
     */
    public static initCopy(toolType: string, options: AdapterOptionsCopy) {
        class CopyAdapter extends this {
            static {
                this.init(toolType, options);
            }
        }
        return CopyAdapter;
    }

    /**
     * @returns true if the tool is of the given tool type based on the tracking identifier
     */
    public static isValidCornerstoneTrackingIdentifier(trackingIdentifier) {
        return this.trackingIdentifiers.has(trackingIdentifier);
    }

    /**
     * Returns annotation data for CS3D to use based on the underlying
     * DICOM SR annotation data.
     */
    public static getMeasurementData(
        measurementGroup,
        sopInstanceUIDToImageIdMap,
        _imageToWorldCoords,
        metadata
    ) {
        const { defaultState: state, ReferencedFrameNumber } =
            MeasurementReport.getSetupMeasurementData(
                measurementGroup,
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

    public static getTID300RepresentationArguments(
        tool,
        worldToImageCoords
    ): Record<string, unknown> {
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
