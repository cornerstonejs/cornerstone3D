import { utilities } from "dcmjs";

import { toScoords } from "../helpers";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";

const { Polyline: TID300Polyline } = utilities.TID300;

export class RectangleROI extends BaseAdapter3D {
    static {
        this.init("RectangleROI", TID300Polyline);
        // Register using the Cornerstone 1.x name so this tool is used to load it
        this.registerLegacy();
    }
    public static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
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
            this.toolType
        );

        const cachedStats = referencedImageId
            ? {
                  [`imageId:${referencedImageId}`]: {
                      area: NUMGroup
                          ? NUMGroup.MeasuredValueSequence.NumericValue
                          : 0
                  }
              }
            : {};
        state.annotation.data = {
            ...state.annotation.data,
            handles: {
                points: worldCoords,
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            },
            cachedStats,
            frameNumber: ReferencedFrameNumber
        };
        return state;
    }

    static getTID300RepresentationArguments(tool, is3DMeasurement = false) {
        const { data, finding, findingSites, metadata } = tool;

        const { polyline, closed } = data.contour;
        const isOpenContour = closed !== true;

        const { referencedImageId } = metadata;
        const scoordProps = {
            is3DMeasurement,
            referencedImageId
        };

        const corners = toScoords(scoordProps, polyline);

        const { area, perimeter } =
            data.cachedStats[`imageId:${referencedImageId}`] || {};

        return {
            points: [
                corners[0],
                corners[1],
                corners[3],
                corners[2],
                corners[0]
            ],
            area,
            perimeter,
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || [],
            use3DSpatialCoordinates: false
        };
    }
}

export default RectangleROI;
