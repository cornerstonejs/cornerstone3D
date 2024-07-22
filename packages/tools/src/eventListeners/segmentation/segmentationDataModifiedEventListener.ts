import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState';
import { SegmentationDataModifiedEventType } from '../../types/EventTypes';
import onLabelmapSegmentationDataModified from './labelmap/onLabelmapSegmentationDataModified';
import { segmentationRenderingEngine } from '../../tools/displayTools/SegmentationRenderingEngine';

/** A callback function that is called when the segmentation data is modified which
 *  often is as a result of tool interactions e.g., scissors, eraser, etc.
 */
const onSegmentationDataModified = function (
  evt: SegmentationDataModifiedEventType
): void {
  const { segmentationId } = evt.detail;
  const { type } = SegmentationState.getSegmentation(segmentationId);

  if (type === SegmentationRepresentations.Labelmap) {
    onLabelmapSegmentationDataModified(evt);
  }

  segmentationRenderingEngine.renderSegmentation(segmentationId);
};

export default onSegmentationDataModified;
