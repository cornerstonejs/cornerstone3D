import type { SegmentationRepresentationModifiedEventType } from '../../types/EventTypes';
import { triggerSegmentationRender } from '../../stateManagement/segmentation/SegmentationRenderingEngine';

/**
 * A function that listens to the `segmentationRepresentationModified` event and triggers
 * the triggerSegmentationRender
 * @param evt - The event object
 */
const segmentationRepresentationModifiedListener = function (
  evt: SegmentationRepresentationModifiedEventType
): void {
  const { viewportId } = evt.detail;

  triggerSegmentationRender(viewportId);
};

export default segmentationRepresentationModifiedListener;
