import { utilities } from '@cornerstonejs/core'
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState'
import { Color } from '../../types/SegmentationStateTypes'
import { ColorLut } from '../../types/SegmentationStateTypes'

/**
 * addColorLUT - Adds a new color LUT to the state at the given colorLUTIndex.
 * If no colorLUT is provided, a new color LUT is generated.
 *
 * @param colorLUTIndex - the index of the colorLUT in the state
 * @param colorLUT - An array of The colorLUT to set.
 * @returns
 */
function addColorLUT(colorLUT: ColorLut, colorLUTIndex: number): void {
  if (!colorLUT) {
    throw new Error('addColorLUT: colorLUT is required')
  }

  // Append the "zero" (no label) color to the front of the LUT, if necessary.
  if (!utilities.isEqual(colorLUT[0], [0, 0, 0, 0])) {
    console.warn(
      'addColorLUT: [0, 0, 0, 0] color is not provided for the background color (segmentIndex =0), automatically adding it'
    )
    colorLUT.unshift([0, 0, 0, 0])
  }

  SegmentationState.addColorLUT(colorLUT, colorLUTIndex)
}

/**
 * Given a tool group UID, a segmentation representationUID, and a segment index, return the
 * color for that segment. It can be used for segmentation tools that need to
 * display the color of their annotation.
 *
 * @param toolGroupId - The Id of the tool group that owns the segmentation data.
 * @param segmentationRepresentationUID - The uid of the segmentation representation
 * @param segmentIndex - The index of the segment in the segmentation
 * @returns A color.
 */
function getColorForSegmentIndex(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  segmentIndex: number
): Color {
  const segmentationRepresentation =
    SegmentationState.getSegmentationRepresentationByUID(
      toolGroupId,
      segmentationRepresentationUID
    )

  if (!segmentationRepresentation) {
    throw new Error(
      `Segmentation data with UID ${segmentationRepresentationUID} does not exist for tool group ${toolGroupId}`
    )
  }

  const { colorLUTIndex } = segmentationRepresentation

  // get colorLUT
  const colorLut = SegmentationState.getColorLut(colorLUTIndex)
  return colorLut[segmentIndex]
}

export { getColorForSegmentIndex, addColorLUT }
