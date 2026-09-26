import { utilities } from 'dcmjs';
import MeasurementReport from './MeasurementReport';
import BaseAdapter3D from './BaseAdapter3D';
import { toScoord } from '../helpers';
import { extractAllNUMGroups, restoreAdditionalMetrics } from './metricHandler';

const { Circle: TID300Circle } = utilities.TID300;

class CircleROI extends BaseAdapter3D {
  static {
    this.init('CircleROI', TID300Circle);
    this.registerLegacy();
  }

  /** Gets the measurement data for cornerstone, given DICOM SR measurement data. */
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
    const referencedSOPInstanceUID = state.sopInstanceUid;
    const allNUMGroups = extractAllNUMGroups(
      MeasurementGroup,
      referencedSOPInstanceUID
    );
    const measurementNUMGroups = allNUMGroups[referencedSOPInstanceUID] || {};
    state.annotation.data = {
      ...state.annotation.data,
      handles: {
        ...state.annotation.data.handles,
        points: worldCoords,
      },
      frameNumber: ReferencedFrameNumber,
    };
    if (referencedImageId) {
      const metrics = restoreAdditionalMetrics(measurementNUMGroups);
      // The tool recomputes its stats only when the units are missing, so a
      // restored radius is shown as is. SRs written before the radius was
      // stored carry only the perimeter, which gives it.
      const radius = metrics.radius ?? (metrics.perimeter ?? 0) / (2 * Math.PI);
      state.annotation.data.cachedStats = {
        [`imageId:${referencedImageId}`]: {
          area: NUMGroup ? NUMGroup.MeasuredValueSequence.NumericValue : 0,
          perimeter: 0,
          ...metrics,
          radius,
          radiusUnit: metrics.radiusUnit ?? metrics.unit,
        },
      };
    }

    return state;
  }

  /**
   * Gets the TID 300 representation of a circle, given the cornerstone representation.
   *
   * @param {Object} tool
   * @returns
   */
  static getTID300RepresentationArguments(tool, is3DMeasurement = false) {
    const { data, finding, findingSites, metadata } = tool;
    const { cachedStats = {}, handles } = data;

    const { referencedImageId } = metadata;
    const scoordProps = {
      is3DMeasurement,
      referencedImageId,
    };

    // Using image coordinates for 2D points
    const center = toScoord(scoordProps, handles.points[0]);
    const end = toScoord(scoordProps, handles.points[1]);

    const {
      area,
      radius,
      max,
      min,
      stdDev,
      mean,
      modalityUnit,
      radiusUnit,
      areaUnit,
    } = super.getCachedStats(cachedStats, metadata);
    const perimeter = 2 * Math.PI * radius;

    return {
      area,
      areaUnit,
      perimeter,
      modalityUnit,
      radiusUnit,
      radius,
      max,
      min,
      stdDev,
      mean,
      points: [center, end],
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

export default CircleROI;
