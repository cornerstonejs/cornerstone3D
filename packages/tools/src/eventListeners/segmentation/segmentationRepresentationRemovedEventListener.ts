import type { SegmentationRepresentationRemovedEventType } from '../../types/EventTypes';
import { getSegmentationRepresentation } from '../../stateManagement/segmentation/segmentationState';
import { triggerSegmentationRenderBySegmentationId } from '../../stateManagement/segmentation/SegmentationRenderingEngine';

/** A function that listens to the `segmentationRepresentationRemoved` event and triggers
 * the `triggerSegmentationRender` function. This function is called when the
 * segmentation state or config is modified.
 */
const segmentationRepresentationRemovedEventListener = function (
  evt: SegmentationRepresentationRemovedEventType
): void {
  const { segmentationRepresentationUID } = evt.detail;

  const segmentation = getSegmentationRepresentation(
    segmentationRepresentationUID
  );

  if (!segmentation) {
    return;
  }

  triggerSegmentationRenderBySegmentationId(segmentation.segmentationId);
};

export default segmentationRepresentationRemovedEventListener;
