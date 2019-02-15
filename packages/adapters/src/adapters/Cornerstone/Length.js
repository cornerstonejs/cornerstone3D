import MeasurementReport from "./MeasurementReport.js";
import TID300Length from "../../utilities/TID300/Length.js";

class Length {
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
            length: groupItemContent.MeasuredValueSequence.NumericValue,
            toolType: Length.toolType
        };

        lengthState.handles = { start: {}, end: {} };
        [
            lengthState.handles.start.x,
            lengthState.handles.start.y,
            lengthState.handles.end.x,
            lengthState.handles.end.y
        ] = lengthContent.GraphicData;

        // TODO: Save textbox position in GraphicData
        lengthState.handles.textBox = {
            hasMoved: false,
            movesIndependently: false,
            drawnIndependently: true,
            allowedOutsideImage: true,
            hasBoundingBox: true
        };

        return lengthState;
    }

    // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
    static getMeasurementData(measurementContent) {
        return measurementContent.map(Length.measurementContentToLengthState);
    }

    static getTID300RepresentationArguments(tool) {
        const point1 = tool.handles.start;
        const point2 = tool.handles.end;
        const distance = tool.length;

        return { point1, point2, distance };
    }
}

Length.toolType = "Length";
Length.utilityToolType = "Length";
Length.TID300Representation = TID300Length;

MeasurementReport.registerTool(Length);

export default Length;
