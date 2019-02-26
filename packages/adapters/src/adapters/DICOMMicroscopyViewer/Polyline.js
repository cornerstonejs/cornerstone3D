import MeasurementReport from "./MeasurementReport.js";
import TID300Polyline from "../../utilities/TID300/Polyline";

class Polyline {
    constructor() {}

    static measurementContentToLengthState(groupItemContent) {
        const lengthContent = groupItemContent.ContentSequence;
        const { ReferencedSOPSequence } = lengthContent.ContentSequence;
        const {
            ReferencedSOPInstanceUID,
            ReferencedFrameNumber
        } = ReferencedSOPSequence;
        const lengthState = {
            sopInstanceUid: ReferencedSOPInstanceUID,
            frameIndex: ReferencedFrameNumber || 0,
            length: groupItemContent.MeasuredValueSequence.NumericValue
        };

        // FROM DICOM TO dicom-microscopy-viewer format

        return lengthState;
    }

    // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
    static getMeasurementData(measurementContent) {
        return measurementContent.map(Length.measurementContentToLengthState);
    }

    // Expects a Polyline scoord from dicom-microscopy-viewer? Check arguments?
    static getTID300RepresentationArguments(scoord) {
        if (scoord.graphicType !== "POLYLINE") {
            throw new Error("We expected a POLYLINE graphicType");
        }

        const points = scoord.graphicData;
        const lengths = 1; // scoord.distances[0];

        // FROM dicom-microscopy-viewer format TO dcmjs adapter format

        return { points, lengths };
    }
}

// TODO: Using dicom-microscopy-viewer's graphic type may not work since both lines and polylines are both POLYLINES
// Might make more sense to just use a polyline adapter instead of 'length' and 'polyline'
Polyline.graphicType = "POLYLINE";
Polyline.toolType = "Polyline";
Polyline.utilityToolType = "Polyline";
Polyline.TID300Representation = TID300Polyline;

MeasurementReport.registerTool(Polyline);

export default Polyline;
