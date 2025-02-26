import CORNERSTONE_3D_TAG from "./cornerstone3DTag";
import MeasurementReport, {
    type AdapterOptions,
    type MeasurementAdapter
} from "./MeasurementReport";

/**
 * This is a basic definition of adapters to be inherited for other adapters.
 */
export default class BaseAdapter3D {
    public static toolType: string;
    public static TID300Representation;
    public static trackingIdentifierTextValue: string;
    public static trackingIdentifiers: Set<string>;

    /**
     * The parent type is another type which could be used to parse this instance,
     * but for which this sub-class has a better representation.  For example,
     * key images are parseable as Probe instances, but are represented as a different tool
     * Thus, the name for the key image is `Cornerstone3DTag:Probe:KeyImage` so that
     * a prefix query testing just the Probe could parse this object and display it,
     * but a better/full path key could also be done.
     */
    public static parentType: string;

    public static init(
        toolType: string,
        representation,
        options?: AdapterOptions
    ) {
        this.toolType = toolType;
        if (BaseAdapter3D.toolType) {
            throw new Error(
                `Base adapter tool type set to ${this.toolType} while setting ${toolType}`
            );
        }
        this.parentType = options?.parentType;
        this.trackingIdentifiers = new Set<string>();

        this.TID300Representation = representation;
        if (this.parentType) {
            this.trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${this.parentType}:${this.toolType}`;
            const alternateTrackingIdentifier = `${CORNERSTONE_3D_TAG}:${this.toolType}`;
            this.trackingIdentifiers.add(alternateTrackingIdentifier);
        } else {
            this.trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${toolType}`;
        }
        this.trackingIdentifiers.add(this.trackingIdentifierTextValue);
        MeasurementReport.registerTool(this);
    }

    public static registerLegacy() {
        this.trackingIdentifiers.add(
            `cornerstoneTools@^4.0.0:${this.toolType}`
        );
    }

    /** Registers a new copy of the given type that has the prefix path the
     * same as that of adapter, but adds the toolType to this path to create
     * a new tool instance of the given type.  This preserves compatibility
     * with parsing in other versions, without need to replace the original parent
     * type.
     */
    public static registerSubType(
        adapter: MeasurementAdapter,
        toolType: string,
        replace?
    ) {
        const subAdapter = Object.create(adapter);
        subAdapter.init(toolType, adapter.TID300Representation, {
            parentType: adapter.parentType || adapter.toolType,
            replace
        });
        return subAdapter;
    }

    /**
     * @returns true if the tool is of the given tool type based on the tracking identifier
     */
    public static _isValidCornerstoneTrackingIdentifier(
        trackingIdentifier: string
    ) {
        if (this.trackingIdentifiers.has(trackingIdentifier)) {
            return true;
        }
        if (!trackingIdentifier.includes(":")) {
            return false;
        }

        return trackingIdentifier.startsWith(this.trackingIdentifierTextValue);
    }

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
