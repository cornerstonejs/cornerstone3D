import { utilities } from '@precisionmetrics/cornerstone-render'
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState'
import { Color } from '../../types/SegmentationStateTypes'
import { ColorLUT } from '../../types/SegmentationStateTypes'
import { checkColorLUTLength, generateNewColorLUT } from './helpers/colorLUT'

const SEGMENTS_PER_SEGMENTATION = 65535 // Todo: max is bigger, but it seems cfun can go upto 255 anyway

/**
 * addColorLUT - Adds a new color LUT to the state at the given colorLUTIndex.
 * If no colorLUT is provided, a new color LUT is generated.
 *
 * @param colorLUTIndex - the index of the colorLUT in the state
 * @param colorLUT - An array of The colorLUT to set.
 * @returns
 */
function addColorLUT(colorLUT: ColorLUT, colorLUTIndex: number): void {
  if (colorLUT) {
    checkColorLUTLength(colorLUT, SEGMENTS_PER_SEGMENTATION)

    if (colorLUT.length < SEGMENTS_PER_SEGMENTATION) {
      colorLUT = [
        ...colorLUT,
        ...generateNewColorLUT(SEGMENTS_PER_SEGMENTATION - colorLUT.length),
      ]
    }
  } else {
    // Auto-generates colorLUT.
    colorLUT = colorLUT || generateNewColorLUT(SEGMENTS_PER_SEGMENTATION)
  }

  // Append the "zero" (no label) color to the front of the LUT, if necessary.
  if (!utilities.isEqual(colorLUT[0], [0, 0, 0, 0])) {
    colorLUT.unshift([0, 0, 0, 0])
  }

  SegmentationState.addColorLUT(colorLUT, colorLUTIndex)
}

/**
 * Given a tool group UID, a segmentation data UID, and a segment index, return the
 * color for that segment. It can be used for segmentation tools that need to
 * display the color of their annotation.
 *
 * @param toolGroupUID - The UID of the tool group that owns the segmentation data.
 * @param segmentationDataUID - The UID of the segmentation data
 * @param segmentIndex - The index of the segment in the segmentation
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

export default { getColorForSegmentIndex, addColorLUT }
export { getColorForSegmentIndex, addColorLUT }
