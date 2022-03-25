import { getSegmentationRepresentations as getSegmentationRepresentationsFromState } from './segmentationState'
import type { ToolGroupSpecificRepresentation } from '../../types/SegmentationStateTypes'

/**
 * Get the segmentation representations of a toolGroup.
 * @param toolGroupId - The id of the tool group
 * @returns An array of representations.
 */
function getSegmentationRepresentations(
  toolGroupId: string
): ToolGroupSpecificRepresentation[] | [] {
  const representations = getSegmentationRepresentationsFromState(toolGroupId)

  if (!representations) {
    return []
  }

  return representations
}

export default getSegmentationRepresentations
