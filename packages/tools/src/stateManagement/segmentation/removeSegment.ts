import { getActiveSegmentIndex } from './getActiveSegmentIndex';
import { getSegmentation } from './getSegmentation';
import { getSegmentationRepresentations } from './getSegmentationRepresentation';
import { getViewportIdsWithSegmentation } from './getViewportIdsWithSegmentation';
import { removeContourSegmentAnnotations } from './helpers/removeSegmentAnnotations';
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
 * @param options.recordHistory - When true, record this removal in history. Set by caller when group recording is active.
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
    setNextSegmentAsActive?: boolean;
    recordHistory?: boolean;
  } = {
    setNextSegmentAsActive: true,
  }
) {
  const segmentation = getSegmentation(segmentationId);

  if (segmentation?.representationData.Contour) {
    removeContourSegmentAnnotations(segmentationId, segmentIndex, {
      recordHistory: options.recordHistory,
    });
  } else if (segmentation?.representationData.Labelmap) {
    clearSegmentValue(segmentationId, segmentIndex, {
      recordHistory: options.recordHistory,
    });
  } else {
    throw new Error('Invalid segmentation type');
  }

  const isThisSegmentActive =
    getActiveSegmentIndex(segmentationId) === segmentIndex;

  const { segments } = segmentation;

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

  if (isThisSegmentActive && options.setNextSegmentAsActive !== false) {
    // set the next or previous segment as active
    const segmentIndices = Object.keys(segments)
      .map(Number)
      .sort((a, b) => a - b);
    const currentIndex = segmentIndices.indexOf(segmentIndex);

    const nextSegmentIndex = segmentIndices[currentIndex + 1];
    const previousSegmentIndex = segmentIndices[currentIndex - 1];

    if (nextSegmentIndex !== undefined) {
      setActiveSegmentIndex(segmentationId, nextSegmentIndex);
    } else if (previousSegmentIndex !== undefined) {
      setActiveSegmentIndex(segmentationId, previousSegmentIndex);
    }
  }

  // remove the segment from the viewport representations
  const viewportIds = getViewportIdsWithSegmentation(segmentationId);

  viewportIds.forEach((viewportId) => {
    const representations = getSegmentationRepresentations(viewportId, {
      segmentationId,
    });

    representations.forEach((representation) => {
      delete representation.segments[segmentIndex];
    });
  });
}
