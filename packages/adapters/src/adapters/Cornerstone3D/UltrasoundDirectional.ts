import { utilities } from "dcmjs";
import { utilities as csUtilities } from "@cornerstonejs/core";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";

const { Length: TID300Length } = utilities.TID300;
const { worldToImageCoords } = csUtilities;

class UltrasoundDirectional extends BaseAdapter3D {
    static {
        this.init("UltrasoundDirectionalTool", TID300Length);
    }
    // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
    static getMeasurementData(
        measurementGroup,
        sopInstanceUIDToImageIdMap,
        metadata
    ) {
        const { state, worldCoords, ReferencedFrameNumber } =
            MeasurementReport.getSetupMeasurementData(
                measurementGroup,
                sopInstanceUIDToImageIdMap,
                metadata,
                this.toolType
            );

        state.annotation.data = {
            ...state.annotation.data,
            handles: {
                ...state.annotation.data.handles,
                points: worldCoords
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(tool, is3DMeasurement) {
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
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || []
        };
    }
}

export default UltrasoundDirectional;
