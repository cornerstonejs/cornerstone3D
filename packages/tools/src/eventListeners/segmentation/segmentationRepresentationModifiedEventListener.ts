import type { SegmentationRepresentationModifiedEventType } from '../../types/EventTypes';
import { getSegmentationRepresentation } from '../../stateManagement/segmentation/segmentationState';
import { triggerSegmentationRenderBySegmentationId } from '../../utilities/segmentation';

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

  triggerSegmentationRenderBySegmentationId(segmentationId);
};

export default segmentationRepresentationModifiedListener;
