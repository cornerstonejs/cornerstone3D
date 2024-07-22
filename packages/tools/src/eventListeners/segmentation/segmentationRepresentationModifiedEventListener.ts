import { SegmentationRepresentationModifiedEventType } from '../../types/EventTypes';
import { getRepresentation } from '../../stateManagement/segmentation/segmentationState';
import { segmentationRenderingEngine } from '../../tools/displayTools/SegmentationRenderingEngine';

/** A function that listens to the `segmentationStateModified` event and triggers
 * the `triggerSegmentationRender` function. This function is called when the
 * segmentation state or config is modified.
 */
const segmentationRepresentationModifiedListener = function (
  evt: SegmentationRepresentationModifiedEventType
): void {
  const { segmentationRepresentationUID } = evt.detail;
  const segmentationRepresentation = getRepresentation
    ? getRepresentation(segmentationRepresentationUID)
    : null;

  if (!segmentationRepresentation) {
    return;
  }

  const segmentationId = segmentationRepresentation?.segmentationId;

  segmentationRenderingEngine.renderSegmentation(segmentationId);
};

export default segmentationRepresentationModifiedListener;
