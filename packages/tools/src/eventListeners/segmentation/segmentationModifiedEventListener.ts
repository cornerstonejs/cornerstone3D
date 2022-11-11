import { SegmentationModifiedEventType } from '../../types/EventTypes';
import {
  getToolGroupIdsWithSegmentation,
  getSegmentationRepresentations,
} from '../../stateManagement/segmentation/segmentationState';
import { triggerSegmentationRepresentationModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';

/** A function that listens to the `segmentationModified` event and triggers
 * the triggerSegmentationRepresentationModified on each toolGroup that
 * has a representation of the given segmentationId.
 */
const segmentationModifiedListener = function (
  evt: SegmentationModifiedEventType
): void {
  const { segmentationId } = evt.detail;

  const toolGroupIds = getToolGroupIdsWithSegmentation(segmentationId);

  toolGroupIds.forEach((toolGroupId) => {
    const segRepresentations = getSegmentationRepresentations(toolGroupId);
    segRepresentations.forEach((representation) => {
      if (representation.segmentationId === segmentationId) {
        triggerSegmentationRepresentationModified(
          toolGroupId,
          representation.segmentationRepresentationUID
        );
      }
    });
  });
};

export default segmentationModifiedListener;
