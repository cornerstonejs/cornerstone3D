import { utilities } from '@dcmjs-org/dcmjs';
import Probe from './Probe';
import MeasurementReport from './MeasurementReport';
const { Point: TID300Point } = utilities.TID300;

export default class KeyImage extends Probe {
  static {
    this.init('KeyImage', TID300Point, { parentType: Probe.toolType });
  }
  static trackingSeriesIdentifier = `${this.trackingIdentifierTextValue}:Series`;
  static trackingPointIdentifier = `${this.trackingIdentifierTextValue}:Point`;
  static trackingSeriesPointIdentifier = `${this.trackingIdentifierTextValue}:SeriesPoint`;

  // The suffixed identifiers also start with the Probe identifier, so register
  // them for KeyImage or the tracking identifier lookup resolves them to Probe.
  static {
    MeasurementReport.registerTrackingIdentifier(
      this,
      this.trackingPointIdentifier,
      this.trackingSeriesIdentifier,
      this.trackingSeriesPointIdentifier
    );
  }

  static getMeasurementData(
    measurementGroup,
    sopInstanceUIDToImageIdMap,
    metadata,
    trackingIdentifier
  ) {
    const baseData = super.getMeasurementData(
      measurementGroup,
      sopInstanceUIDToImageIdMap,
      metadata,
      trackingIdentifier
    );
    const { data } = baseData.annotation;
    data.isPoint = trackingIdentifier.indexOf('Point') !== -1;
    data.seriesLevel = trackingIdentifier.indexOf(':Series') > 0;

    return baseData;
  }

  public static getTID300RepresentationArguments(tool) {
    const tid300Arguments = super.getTID300RepresentationArguments(tool);
    const { data } = tool;
    if (data.isPoint) {
      if (data.seriesLevel) {
        tid300Arguments.trackingIdentifierTextValue =
          this.trackingSeriesPointIdentifier;
      } else {
        tid300Arguments.trackingIdentifierTextValue =
          this.trackingPointIdentifier;
      }
    } else if (data.seriesLevel) {
      tid300Arguments.trackingIdentifierTextValue =
        this.trackingSeriesIdentifier;
    }
    if (!tid300Arguments.points.length) {
      tid300Arguments.points.push({ x: 0, y: 0 });
    }
    return tid300Arguments;
  }
}

export { KeyImage };
