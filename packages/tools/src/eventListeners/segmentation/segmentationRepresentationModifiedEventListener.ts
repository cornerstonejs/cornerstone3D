import triggerSegmentationRender from '../../utilities/segmentation/triggerSegmentationRender';
import { SegmentationRepresentationModifiedEventType } from '../../types/EventTypes';
import { getSegmentationRepresentation } from '../../stateManagement/segmentation/segmentationState';

/** A function that listens to the `segmentationStateModified` event and triggers
 * the `triggerSegmentationRender` function. This function is called when the
 * segmentation state or config is modified.
 */
const segmentationRepresentationModifiedListener = function (
  evt: SegmentationRepresentationModifiedEventType
): void {
  const { segmentationRepresentationUID } = evt.detail;
  const segmentationRepresentation = getSegmentationRepresentation
    ? getSegmentationRepresentation(segmentationRepresentationUID)
    : null;

  if (!segmentationRepresentation) {
    return;
  }

  const segmentationId = segmentationRepresentation?.segmentationId;

  triggerSegmentationRender(segmentationId);
};

export default segmentationRepresentationModifiedListener;
