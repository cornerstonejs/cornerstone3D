import { SegmentationModifiedEventType } from '../../types/EventTypes';
import {} from '../../stateManagement/segmentation/triggerSegmentationEvents';
import { segmentationRenderingEngine } from '../../tools/displayTools/SegmentationRenderingEngine';

/** A function that listens to the `segmentationModified` event and triggers
 * the triggerSegmentationRepresentationModified
 */
const segmentationModifiedListener = function (
  evt: SegmentationModifiedEventType
): void {
  const { segmentationId } = evt.detail;

  segmentationRenderingEngine.renderSegmentation(segmentationId);
};

export default segmentationModifiedListener;
