import { getActiveSegmentIndex } from './getActiveSegmentIndex';
import { getSegmentation } from './getSegmentation';
import { clearSegmentValue } from './helpers/clearSegmentValue';
import { setActiveSegmentIndex } from './segmentIndex';
import { updateSegmentations } from './updateSegmentations';

/**
 * Removes a segment from a segmentation.
 *
 * @param segmentationId - The unique identifier of the segmentation.
 * @param segmentIndex - The index of the segment to be removed.
 * @param options - Additional options for segment removal.
 * @param options.setNextSegmentAsActive - Whether to set the next available segment as active after removal. Defaults to true.
 *
 * @remarks
 * This function performs the following steps:
 * 1. Clears the segment value from the segmentation data.
 * 2. Removes the segment from the list of segments.
 * 3. If the removed segment was active and setNextSegmentAsActive is true, it sets the next or previous segment as active.
 * 4. Updates the segmentation state with the modified segments.
 *
 */
export function removeSegment(
  segmentationId: string,
  segmentIndex: number,
  options: {
    setNextSegmentAsActive: boolean;
  } = {
    setNextSegmentAsActive: true,
  }
) {
  clearSegmentValue(segmentationId, segmentIndex);

  const isThisSegmentActive =
    getActiveSegmentIndex(segmentationId) === segmentIndex;

  const segmentation = getSegmentation(segmentationId);
  const { segments } = segmentation;
  debugger;
  // remove the segment from the list
  delete segments[segmentIndex];

  const updatedSegments = {
    ...segments,
  };

  updateSegmentations([
    {
      segmentationId,
      payload: {
        segments: updatedSegments,
      },
    },
  ]);

  if (isThisSegmentActive && options.setNextSegmentAsActive) {
    // set the next or previous segment as active
    const nextSegmentIndex = segmentIndex + 1;
    const previousSegmentIndex = segmentIndex - 1;

    if (segments[nextSegmentIndex]) {
      setActiveSegmentIndex(segmentationId, nextSegmentIndex);
    } else if (segments[previousSegmentIndex]) {
      setActiveSegmentIndex(segmentationId, previousSegmentIndex);
    }
  }
}
