import { utilities } from "dcmjs";
import Probe from "./Probe";
const { Point: TID300Point } = utilities.TID300;

export default class KeyImage extends Probe {
    static {
        this.init("KeyImage", TID300Point, { parentType: Probe.toolType });
    }
    static trackingSeriesIdentifier = `${this.trackingIdentifierTextValue}:Series`;
    static trackingPointIdentifier = `${this.trackingIdentifierTextValue}:Point`;
    static trackingSeriesPointIdentifier = `${this.trackingIdentifierTextValue}:SeriesPoint`;

    static getMeasurementData(
        measurementGroup,
        sopInstanceUIDToImageIdMap,
        imageToWorldCoords,
        metadata,
        trackingIdentifier
    ) {
        const baseData = super.getMeasurementData(
            measurementGroup,
            sopInstanceUIDToImageIdMap,
            imageToWorldCoords,
            metadata,
            trackingIdentifier
        );
        const { data } = baseData.annotation;
        data.isPoint = trackingIdentifier.indexOf("Point") !== -1;

        return baseData;
    }

    public static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const tid300Arguments = super.getTID300RepresentationArguments(
            tool,
            worldToImageCoords
        );
        const { data } = tool;
        if (data.isPoint) {
            if (data.seriesLevel) {
                tid300Arguments.trackingIdentifierTextValue =
                    this.trackingSeriesPointIdentifier;
            } else {
                tid300Arguments.trackingIdentifierTextValue =
                    this.trackingPointIdentifier;
            }
        }
        if (data.seriesLevel) {
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
