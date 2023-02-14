import {
  SegmentationPublicInput,
  Segmentation,
} from '../../../types/SegmentationStateTypes';

/**
 * It takes in a segmentation input and returns a segmentation with default values
 * @param segmentationInput - The input to the segmentation.
 * @returns A Segmentation object.
 * @internal
 */
function normalizeSegmentationInput(
  segmentationInput: SegmentationPublicInput
): Segmentation {
  const { segmentationId, representation } = segmentationInput;

  // Todo: we should be able to let the user pass in non-default values for
  // cachedStats, label, activeSegmentIndex, etc.
  return {
    segmentationId,
    cachedStats: {},
    segmentLabels: {},
    label: null,
    segmentsLocked: new Set(),
    type: representation.type,
    activeSegmentIndex: 1,
    representationData: {
      [representation.type]: {
        ...representation.data,
      },
    },
  };
}

export default normalizeSegmentationInput;
