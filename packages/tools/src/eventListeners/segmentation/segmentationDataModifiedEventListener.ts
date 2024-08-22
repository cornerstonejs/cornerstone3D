import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import type { SegmentationDataModifiedEventType } from '../../types/EventTypes';
import { triggerSegmentationRenderBySegmentationId } from '../../stateManagement/segmentation/SegmentationRenderingEngine';
import onLabelmapSegmentationDataModified from './labelmap/onLabelmapSegmentationDataModified';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';

/** A callback function that is called when the segmentation data is modified which
 *  often is as a result of tool interactions e.g., scissors, eraser, etc.
 */
const onSegmentationDataModified = function (
  evt: SegmentationDataModifiedEventType
): void {
  const { segmentationId } = evt.detail;
  const { type } = getSegmentation(segmentationId);

  if (type === SegmentationRepresentations.Labelmap) {
    onLabelmapSegmentationDataModified(evt);
  }

  triggerSegmentationRenderBySegmentationId(segmentationId);
};

export default onSegmentationDataModified;
