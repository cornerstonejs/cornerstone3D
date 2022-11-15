import triggerSegmentationRender from '../../utilities/segmentation/triggerSegmentationRender';
import { SegmentationRepresentationModifiedEventType } from '../../types/EventTypes';

/** A function that listens to the `segmentationStateModified` event and triggers
 * the `triggerSegmentationRender` function. This function is called when the
 * segmentation state or config is modified.
 */
const segmentationRepresentationModifiedListener = function (
  evt: SegmentationRepresentationModifiedEventType
): void {
  const { toolGroupId } = evt.detail;
  triggerSegmentationRender(toolGroupId);
};

export default segmentationRepresentationModifiedListener;
