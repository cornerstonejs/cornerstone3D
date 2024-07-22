import { SegmentationModifiedEventType } from '../../types/EventTypes';
import {} from '../../stateManagement/segmentation/triggerSegmentationEvents';
import { triggerSegmentationRender } from '../../utilities/segmentation';

/** A function that listens to the `segmentationModified` event and triggers
 * the triggerSegmentationRepresentationModified
 */
const segmentationModifiedListener = function (
  evt: SegmentationModifiedEventType
): void {
  const { segmentationId } = evt.detail;

  triggerSegmentationRender(segmentationId);
};

export default segmentationModifiedListener;
