import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";
import { toScoord } from "../helpers";

const { CobbAngle: TID300CobbAngle } = utilities.TID300;

class Angle extends BaseAdapter3D {
    static {
        this.init("Angle", TID300CobbAngle);
        this.registerLegacy();
    }

    // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
    public static getMeasurementData(
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
                      angle: NUMGroup
                          ? NUMGroup.MeasuredValueSequence.NumericValue
                          : null
                  }
              }
            : {};
        state.annotation.data = {
            ...state.annotation.data,
            handles: {
                ...state.annotation.data.handles,
                points: [worldCoords[0], worldCoords[1], worldCoords[3]]
            },
            cachedStats,
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    public static getTID300RepresentationArguments(
        tool,
        is3DMeasurement = false
    ) {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;

        const { referencedImageId } = metadata;
        const scoordProps = {
            is3DMeasurement,
            referencedImageId
        };

        // Do the conversion automatically for the right coord type
        const point1 = toScoord(scoordProps, handles.points[0]);
        const point2 = toScoord(scoordProps, handles.points[1]);
        const point3 = toScoord(scoordProps, handles.points[1]);
        const point4 = toScoord(scoordProps, handles.points[2]);

        const angle = cachedStats[`imageId:${referencedImageId}`]?.angle;

        // Represented as a cobb angle
        return {
            point1,
            point2,
            point3,
            point4,
            rAngle: angle,
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || [],
            ReferencedFrameOfReferenceUID: is3DMeasurement
                ? metadata.FrameOfReferenceUID
                : null,
            use3DSpatialCoordinates: is3DMeasurement
        };
    }
}

export default Angle;
