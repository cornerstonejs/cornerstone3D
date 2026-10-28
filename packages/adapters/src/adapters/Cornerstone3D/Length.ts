import { utilities } from 'dcmjs';
import MeasurementReport from './MeasurementReport';
import BaseAdapter3D from './BaseAdapter3D';
import { toScoord } from '../helpers';
import { resolveUnit } from './metricHandler';

const { Length: TID300Length } = utilities.TID300;

const LENGTH = 'Length';

export default class Length extends BaseAdapter3D {
  static {
    this.init(LENGTH, TID300Length);
    // Register using the Cornerstone 1.x name so this tool is used to load it
    this.registerLegacy();
  }

  // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
  /**
   * Restores a Length annotation from a TID 1500 measurement group, including
   * the length and the unit it was measured in.
   */
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

    const cachedStats = referencedImageId
      ? {
          [`imageId:${referencedImageId}`]: {
            length: NUMGroup ? NUMGroup.MeasuredValueSequence.NumericValue : 0,
            // dcmjs writes px as the UCUM unity code "1" with CodeMeaning "px"
            unit: resolveUnit(
              'Length',
              NUMGroup.MeasuredValueSequence.MeasurementUnitsCodeSequence
            ),
          },
        }
      : {};
    state.annotation.data = {
      ...state.annotation.data,
      handles: {
        ...state.annotation.data.handles,
        points: [worldCoords[0], worldCoords[1]],
        activeHandleIndex: 0,
      },
      cachedStats,
      frameNumber: ReferencedFrameNumber,
    };

    return state;
  }

  /**
   * Builds the TID300 Length arguments from the annotation: the two points,
   * the length and its unit from the cached stats.
   */
  static getTID300RepresentationArguments(tool, is3DMeasurement = false) {
    const { data, finding, findingSites, metadata } = tool;
    const { cachedStats = {}, handles } = data;

    const { referencedImageId } = metadata;
    const scoordProps = {
      is3DMeasurement,
      referencedImageId,
    };

    // Do the conversion automatically for hte right coord type
    const point1 = toScoord(scoordProps, handles.points[0]);
    const point2 = toScoord(scoordProps, handles.points[1]);

    const { length: distance, unit } = super.getCachedStats(
      cachedStats,
      metadata
    );

    return {
      point1,
      point2,
      distance,
      // Without a unit dcmjs writes "mm", whatever the length was measured in
      unit,
      trackingIdentifierTextValue: this.trackingIdentifierTextValue,
      finding,
      findingSites: findingSites || [],
      use3DSpatialCoordinates: is3DMeasurement,
    };
  }
}
