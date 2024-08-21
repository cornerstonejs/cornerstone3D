import type { SegmentationModifiedEventType } from '../../types/EventTypes';
import {} from '../../stateManagement/segmentation/triggerSegmentationEvents';
import { triggerSegmentationRenderBySegmentationId } from '../../stateManagement/segmentation/SegmentationRenderingEngine';

/** A function that listens to the `segmentationModified` event and triggers
 * the triggerSegmentationRepresentationModified
 */
const segmentationModifiedListener = function (
  evt: SegmentationModifiedEventType
): void {
  const { segmentationId } = evt.detail;

  triggerSegmentationRenderBySegmentationId(segmentationId);
};

export default segmentationModifiedListener;
