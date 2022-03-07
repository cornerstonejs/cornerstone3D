import * as SegmentationState from '../../stateManagement/segmentation/segmentationState'

import { Color } from '../../types/SegmentationStateTypes'

/**
 * Given a tool group UID, a segmentation data UID, and a segment index, return the
 * color for that segment. It can be used for segmentation tools that need to
 * display the color of their annotation.
 *
 * @param {string} toolGroupUID - The UID of the tool group that owns the
 * segmentation data.
 * @param {string} segmentationDataUID - The UID of the segmentation data
 * @param {number} segmentIndex - The index of the segment in the segmentation
 * @returns A color.
 */
function getColorForSegmentIndex(
  toolGroupUID: string,
  segmentationDataUID: string,
  segmentIndex: number
): Color {
  const segmentationData = SegmentationState.getSegmentationDataByUID(
    toolGroupUID,
    segmentationDataUID
  )

  if (!segmentationData) {
    throw new Error(
      `Segmentation data with UID ${segmentationDataUID} does not exist for tool group ${toolGroupUID}`
    )
  }

  const { colorLUTIndex } = segmentationData

  // get colorLUT
  const colorLut = SegmentationState.getColorLut(colorLUTIndex)
  return colorLut[segmentIndex]
}

/**
 * Add a color LUT to the segmentation state to be used by the segmentations
 * @param {Color[]} colorLUT - A list of colors to be added to the color lookup
 * table.
 * @param {number} colorLUTIndex - The index of the color LUT in the state to be
 * updated.
 */
function addColorLut(colorLUT: Color[], colorLUTIndex = 0): void {
  SegmentationState.addColorLut(colorLUT, colorLUTIndex)
}

export default { getColorForSegmentIndex, addColorLut }
export { getColorForSegmentIndex, addColorLut }
