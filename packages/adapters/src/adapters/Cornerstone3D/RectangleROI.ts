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
        const { state, worldCoords, referencedImageId, ReferencedFrameNumber } =
            MeasurementReport.getSetupMeasurementData(
                MeasurementGroup,
                sopInstanceUIDToImageIdMap,
                metadata,
                this.toolType
            );

        const areaGroup = MeasurementGroup.ContentSequence.find(
            g =>
                g.ValueType === "NUM" &&
                g.ConceptNameCodeSequence[0].CodeMeaning === "Area"
        );
        const cachedStats = referencedImageId
            ? {
                  [`imageId:${referencedImageId}`]: {
                      area:
                          areaGroup?.MeasuredValueSequence?.[0]?.NumericValue ||
                          0,
                      areaUnit:
                          areaGroup?.MeasuredValueSequence?.[0]
                              ?.MeasurementUnitsCodeSequence?.CodeValue
                  }
              }
            : {};
        state.annotation.data = {
            ...state.annotation.data,
            handles: {
                ...state.annotation.data.handles,
                points: [
                    worldCoords[0],
                    worldCoords[1],
                    worldCoords[3],
                    worldCoords[2]
                ]
            },
            cachedStats,
            frameNumber: ReferencedFrameNumber
        };
        return state;
    }

    static getTID300RepresentationArguments(tool, is3DMeasurement = false) {
        const { data, finding, findingSites, metadata } = tool;

        const { referencedImageId } = metadata;
        const scoordProps = {
            is3DMeasurement,
            referencedImageId
        };

        const corners = toScoords(scoordProps, data.handles.points);

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
            use3DSpatialCoordinates: is3DMeasurement
        };
    }
}

export default RectangleROI;
