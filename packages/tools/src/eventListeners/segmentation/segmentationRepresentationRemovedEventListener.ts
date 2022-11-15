import triggerSegmentationRender from '../../utilities/segmentation/triggerSegmentationRender';
import { SegmentationRepresentationRemovedEventType } from '../../types/EventTypes';

/** A function that listens to the `segmentationRepresentationRemoved` event and triggers
 * the `triggerSegmentationRender` function. This function is called when the
 * segmentation state or config is modified.
 */
const segmentationRepresentationRemovedEventListener = function (
  evt: SegmentationRepresentationRemovedEventType
): void {
  const { toolGroupId, segmentationRepresentationUID } = evt.detail;

  triggerSegmentationRender(toolGroupId);
};

export default segmentationRepresentationRemovedEventListener;
