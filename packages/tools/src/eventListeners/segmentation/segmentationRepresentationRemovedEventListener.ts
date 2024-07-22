import { SegmentationRepresentationRemovedEventType } from '../../types/EventTypes';
import { getRepresentation } from '../../stateManagement/segmentation/segmentationState';
import { segmentationRenderingEngine } from '../../tools/displayTools/SegmentationRenderingEngine';

/** A function that listens to the `segmentationRepresentationRemoved` event and triggers
 * the `triggerSegmentationRender` function. This function is called when the
 * segmentation state or config is modified.
 */
const segmentationRepresentationRemovedEventListener = function (
  evt: SegmentationRepresentationRemovedEventType
): void {
  const { segmentationRepresentationUID } = evt.detail;

  const segmentation = getRepresentation(segmentationRepresentationUID);

  segmentationRenderingEngine.renderSegmentation(segmentation.segmentationId);
};

export default segmentationRepresentationRemovedEventListener;
