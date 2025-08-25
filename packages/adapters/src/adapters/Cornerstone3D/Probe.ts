import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";
import { toScoords } from "../helpers";

const { Point: TID300Point } = utilities.TID300;

class Probe extends BaseAdapter3D {
    static {
        this.init("Probe", TID300Point);
        this.registerLegacy();
        this.registerType("DCM:111030", "POINT", 1);
        this.registerType("DCM:111030", "POINT", 2);
    }

    public static isValidMeasurement(measurement) {
        const graphicItem = this.getGraphicItem(measurement);
        return (
            this.getGraphicType(graphicItem) === "POINT" &&
            this.getPointsCount(graphicItem) <= 2
        );
    }

    static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        metadata,
        _trackingIdentifier
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
                      value:
                          NUMGroup?.MeasuredValueSequence?.NumericValue ?? null
                  }
              }
            : {};
        state.annotation.data = {
            ...state.annotation.data,
            handles: {
                ...state.annotation.data.handles,
                points: worldCoords
            },
            cachedStats,
            frameNumber: ReferencedFrameNumber,
            invalidated: true
        };

        return state;
    }

    public static getTID300RepresentationArguments(
        tool,
        is3DMeasurement = false
    ) {
        const { data, metadata } = tool;
        const { finding, findingSites } = tool;
        const { referencedImageId } = metadata;
        const scoordProps = {
            is3DMeasurement,
            referencedImageId
        };

        const {
            handles: { points = [] }
        } = data;

        // Using image coordinates for 2D points
        const pointsImage = toScoords(scoordProps, points);

        return {
            points: pointsImage,
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            findingSites: findingSites || [],
            finding,
            ReferencedFrameOfReferenceUID: is3DMeasurement
                ? metadata.FrameOfReferenceUID
                : null,
            use3DSpatialCoordinates: is3DMeasurement
        };
    }
}

export default Probe;
