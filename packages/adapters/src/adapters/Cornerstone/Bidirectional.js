import MeasurementReport from "./MeasurementReport";
import TID300Bidirectional from "../../utilities/TID300/Bidirectional";

class Bidirectional {
  constructor() {
  }

  static measurementContentToLengthState(groupItemContent) {
    const content = groupItemContent.ContentSequence;
    const { ReferencedSOPSequence } = content.ContentSequence;
    const { ReferencedSOPInstanceUID, ReferencedFrameNumber } = ReferencedSOPSequence
    const state = {
      sopInstanceUid: ReferencedSOPInstanceUID,
      frameIndex: ReferencedFrameNumber || 0,
      toolType: Bidirectional.toolType,
    };

    // TODO: To be implemented!
    // Needs to add longAxis, shortAxis, longAxisLength, shortAxisLength

    return state;
  }

  // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
  static getMeasurementData(measurementContent) {
    return measurementContent.map(Bidirectional.measurementContentToLengthState);
  }

  static getTID300RepresentationArguments(tool) {
    // TO BE IMPLEMENTED
    return {longAxis, shortAxis, longAxisLength, shortAxisLength};
  }
}

Bidirectional.toolType = 'bidirectional';
Bidirectional.utilityToolType = 'Bidirectional';
Bidirectional.TID300Representation = TID300Bidirectional;

MeasurementReport.registerTool(Bidirectional);

export default Bidirectional;
