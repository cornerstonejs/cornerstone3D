import {
  SegmentationPublicInput,
  Segmentation,
} from '../../../types/SegmentationStateTypes'

function normalizeSegmentationInput(
  segmentationInput: SegmentationPublicInput
): Segmentation {
  const { segmentationId, representation } = segmentationInput

  // Todo: we should be able to let the user pass in non-default values for
  // cachedStats, label, activeSegmentIndex, etc.
  return {
    segmentationId,
    cachedStats: {},
    label: segmentationId,
    segmentsLocked: new Set(),
    type: representation.type,
    activeSegmentIndex: 0,
    representations: {
      [representation.type]: {
        ...representation.data,
      },
    },
  }
}

export default normalizeSegmentationInput
