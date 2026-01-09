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
        metadata
    ) {
        const {
            state,
            NUMGroup,
            worldCoords,
            referencedImageId,
            ReferencedFrameNumber
        } = MeasurementReport.getSetupMeasurementData(
            MeasurementGroup,
            sopInstanceUIDToImageIdMap,
            metadata,
            this.toolType
        );

        const cachedStats = referencedImageId
            ? {
                  [`imageId:${referencedImageId}`]: {
                      length: NUMGroup
                          ? NUMGroup.MeasuredValueSequence.NumericValue
                          : 0,
                      unit: NUMGroup.MeasuredValueSequence
                          .MeasurementUnitsCodeSequence.CodeValue
                  }
              }
            : {};
        state.annotation.data = {
            ...state.annotation.data,
            handles: {
                ...state.annotation.data.handles,
                points: [worldCoords[0], worldCoords[1]],
                activeHandleIndex: 0
            },
            cachedStats,
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(tool, is3DMeasurement = false) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;

        const { referencedImageId } = metadata;
        const scoordProps = {
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
