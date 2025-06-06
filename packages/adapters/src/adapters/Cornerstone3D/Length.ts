import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";
import { toScoord } from "../helpers";
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
            state,
            NUMGroup,
            scoord,
            scoordArgs,
            worldCoords,
            referencedImageId,
            ReferencedFrameNumber
        } = MeasurementReport.getSetupMeasurementData(
            MeasurementGroup,
            sopInstanceUIDToImageIdMap,
            metadata,
            this.toolType,
            imageToWorldCoords
        );

        state.annotation.data = {
            handles: {
                points: [worldCoords[0], worldCoords[1]],
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            },
            frameNumber: ReferencedFrameNumber
        };
        if (referencedImageId) {
            state.annotation.data.cachedStats = {
                [`imageId:${referencedImageId}`]: {
                    length: NUMGroup
                        ? NUMGroup.MeasuredValueSequence.NumericValue
                        : 0
                }
            };
        }

        return state;
    }

    static getTID300RepresentationArguments(
        tool,
        worldToImageCoords,
        is3DMeasurement = false
    ) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;

        const { referencedImageId } = metadata;
        const scoordProps = {
            worldToImageCoords,
            is3DMeasurement,
            referencedImageId
        };

        // Do the conversion automatically for hte right coord type
        const point1 = toScoord(scoordProps, handles.points[0]);
        const point2 = toScoord(scoordProps, handles.points[1]);

        const { length: distance } =
            cachedStats[`imageId:${referencedImageId}`] || {};

        return {
            point1,
            point2,
            distance,
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || [],
            use3DSpatialCoordinates: is3DMeasurement
        };
    }
}
