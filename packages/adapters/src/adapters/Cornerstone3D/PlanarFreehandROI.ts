import MeasurementReport from './MeasurementReport';
import { utilities } from 'dcmjs';
import { vec3 } from 'gl-matrix';
import BaseAdapter3D from './BaseAdapter3D';
import { extractAllNUMGroups, restoreAdditionalMetrics } from './metricHandler';
import { toScoords, toArray } from '../helpers';
import ControlPointPolyline from './ControlPointPolyline';
import { SPLINE_TYPE_CODE } from './constants';

/** Contour/polyline SR logic is shared by LivewireContour, registered as a subtype. */
class PlanarFreehandROI extends BaseAdapter3D {
  public static closedContourThreshold = 1e-5;

  static {
    this.init('PlanarFreehandROI', ControlPointPolyline);
    PlanarFreehandROI.registerSubType(PlanarFreehandROI, 'LivewireContour');
    PlanarFreehandROI.registerSubType(PlanarFreehandROI, 'SplineROI');
  }

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
      ReferencedFrameNumber,
    } = MeasurementReport.getSetupMeasurementData(
      MeasurementGroup,
      sopInstanceUIDToImageIdMap,
      metadata,
      this.toolType
    );

    const distanceBetweenFirstAndLastPoint = vec3.distance(
      worldCoords[worldCoords.length - 1],
      worldCoords[0]
    );

    let isOpenContour = true;

    // If the contour is closed, this should have been encoded as exactly the same point, so check for a very small difference.
    if (distanceBetweenFirstAndLastPoint < this.closedContourThreshold) {
      worldCoords.pop(); // Remove the last element which is duplicated.

      isOpenContour = false;
    }

    // Use decoded control points when present (CONTROL_POINTS_CODE SCOORD); otherwise fallback for open contours.
    let points = state.annotation.data.handles?.points ?? [];
    if (isOpenContour && points.length === 0) {
      points = [worldCoords[0], worldCoords[worldCoords.length - 1]];
    }

    const referencedSOPInstanceUID = state.sopInstanceUid;
    const allNUMGroups = extractAllNUMGroups(
      MeasurementGroup,
      referencedSOPInstanceUID
    );
    const measurementNUMGroups = allNUMGroups[referencedSOPInstanceUID] || {};
    const SPLINE_TYPE = {
      CodingSchemeDesignator: SPLINE_TYPE_CODE.schemeDesignator,
      CodeValue: SPLINE_TYPE_CODE.value,
    };
    const numSeq = NUMGroup
      ? toArray((NUMGroup as Record<string, unknown>).ContentSequence)
      : [];
    const mgContentSeq = toArray(
      (MeasurementGroup as Record<string, unknown>).ContentSequence
    );
    const splineTypeItem =
      numSeq.find((item) =>
        MeasurementReport.codeValueMatch(item, SPLINE_TYPE)
      ) ??
      mgContentSeq.find((item) =>
        MeasurementReport.codeValueMatch(item, SPLINE_TYPE)
      );

    state.annotation.data = {
      ...state.annotation.data,
      contour: { polyline: worldCoords, closed: !isOpenContour },
      handles: {
        ...state.annotation.data.handles,
        points,
      },
      frameNumber: ReferencedFrameNumber,
      ...(splineTypeItem && {
        spline: { type: splineTypeItem.TextValue },
      }),
    };

    if (referencedImageId) {
      state.annotation.data.cachedStats = {
        [`imageId:${referencedImageId}`]: {
          ...(!isOpenContour && NUMGroup
            ? { area: NUMGroup.MeasuredValueSequence.NumericValue }
            : {}),
          ...restoreAdditionalMetrics(measurementNUMGroups),
        },
      };
    }
    return state;
  }

  static getTID300RepresentationArguments(tool, is3DMeasurement = false) {
    const { data, finding, findingSites, metadata } = tool;

    const { handles } = data;
    const { polyline, closed } = data.contour;
    const isOpenContour = closed !== true;

    const { referencedImageId } = metadata;
    const scoordProps = {
      is3DMeasurement,
      referencedImageId,
    };

    const points = toScoords(scoordProps, polyline);

    if (!isOpenContour) {
      // Need to repeat the first point at the end of to have an explicitly closed contour.
      const firstPoint = points[0];
      points.push(firstPoint);
    }

    const controlPoints =
      handles?.points?.length && toScoords(scoordProps, handles.points);

    const {
      area,
      areaUnit,
      modalityUnit,
      perimeter,
      mean,
      max,
      stdDev,
      length,
    } = data.cachedStats[`imageId:${referencedImageId}`] || {};

    return {
      /** From cachedStats */
      points,
      controlPoints,
      area,
      areaUnit,
      perimeter: perimeter ?? length,
      modalityUnit,
      mean,
      max,
      stdDev,
      /** Other */
      splineType: data.spline?.type,
      trackingIdentifierTextValue: this.trackingIdentifierTextValue,
      finding,
      findingSites: findingSites || [],
      ReferencedFrameOfReferenceUID: is3DMeasurement
        ? metadata.FrameOfReferenceUID
        : null,
      use3DSpatialCoordinates: is3DMeasurement,
    };
  }
}

export default PlanarFreehandROI;
