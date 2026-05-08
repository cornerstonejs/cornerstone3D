import { utilities } from 'dcmjs';

import { toScoords } from '../helpers';
import MeasurementReport from './MeasurementReport';
import BaseAdapter3D from './BaseAdapter3D';
import { extractAllNUMGroups, restoreAdditionalMetrics } from './metricHandler';

const { Polyline: TID300Polyline } = utilities.TID300;

export class RectangleROI extends BaseAdapter3D {
  static {
    this.init('RectangleROI', TID300Polyline);
    // Register using the Cornerstone 1.x name so this tool is used to load it
    this.registerLegacy();
    this.registerType('DCM:111030', 'POLYLINE', 4);
    this.registerType('DCM:111030', 'POLYLINE', 5);
  }

  public static isValidMeasurement(measurement) {
    const graphicItem = this.getGraphicItem(measurement);
    const pointsCount = this.getPointsCount(graphicItem);
    return (
      this.getGraphicType(graphicItem) === 'POLYLINE' &&
      (pointsCount === 4 || pointsCount === 5)
    );
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

    // If the rectangle is closed (5 points with first point repeated), remove the duplicate
    const points =
      worldCoords.length === 5 ? worldCoords.slice(0, 4) : worldCoords;

    const areaGroup = MeasurementGroup.ContentSequence.find(
      (g) =>
        g.ValueType === 'NUM' &&
        g.ConceptNameCodeSequence.CodeMeaning === 'Area'
    );

    const referencedSOPInstanceUID = state.sopInstanceUid;
    const allNUMGroups = extractAllNUMGroups(
      MeasurementGroup,
      referencedSOPInstanceUID
    );
    const measurementNUMGroups = allNUMGroups[referencedSOPInstanceUID] || {};

    const cachedStats = referencedImageId
      ? {
          [`imageId:${referencedImageId}`]: {
            area: areaGroup?.MeasuredValueSequence?.[0]?.NumericValue || 0,
            areaUnit:
              areaGroup?.MeasuredValueSequence?.[0]
                ?.MeasurementUnitsCodeSequence?.CodeValue,
            ...restoreAdditionalMetrics(measurementNUMGroups),
          },
        }
      : {};
    const handlesPoints = [points[0], points[1], points[3], points[2]];
    state.annotation.data = {
      ...state.annotation.data,
      handles: {
        ...state.annotation.data.handles,
        points: handlesPoints,
      },
      cachedStats,
      frameNumber: ReferencedFrameNumber,
    };
    return state;
  }

  static getTID300RepresentationArguments(tool, is3DMeasurement = false) {
    const { data, finding, findingSites, metadata } = tool;

    const { referencedImageId } = metadata;
    const scoordProps = {
      is3DMeasurement,
      referencedImageId,
    };

    const corners = toScoords(scoordProps, data.handles.points);

    const { area, perimeter, max, mean, stdDev, areaUnit, modalityUnit } =
      data.cachedStats[`imageId:${referencedImageId}`] || {};

    return {
      points: [corners[0], corners[1], corners[3], corners[2], corners[0]],
      area,
      perimeter,
      max,
      mean,
      stdDev,
      areaUnit,
      modalityUnit,
      trackingIdentifierTextValue: this.trackingIdentifierTextValue,
      finding,
      findingSites: findingSites || [],
      use3DSpatialCoordinates: is3DMeasurement,
    };
  }
}

export default RectangleROI;
