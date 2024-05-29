import triggerSegmentationRender from '../../utilities/segmentation/triggerSegmentationRender.js';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations.js';
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState.js';
import { SegmentationDataModifiedEventType } from '../../types/EventTypes.js';
import onLabelmapSegmentationDataModified from './labelmap/onLabelmapSegmentationDataModified.js';

/** A callback function that is called when the segmentation data is modified which
 *  often is as a result of tool interactions e.g., scissors, eraser, etc.
 */
const onSegmentationDataModified = function (
  evt: SegmentationDataModifiedEventType
): void {
  const { segmentationId } = evt.detail;
  const { type } = SegmentationState.getSegmentation(segmentationId);

  const toolGroupIds =
    SegmentationState.getToolGroupIdsWithSegmentation(segmentationId);

  if (type === SegmentationRepresentations.Labelmap) {
    onLabelmapSegmentationDataModified(evt);
  }

  toolGroupIds.forEach((toolGroupId) => {
    triggerSegmentationRender(toolGroupId);
  });
};

export default onSegmentationDataModified;
