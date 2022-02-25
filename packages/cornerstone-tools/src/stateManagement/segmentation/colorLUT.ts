// import state, { Color, ColorLUT, getLabelmapStateForElement } from './state'
import { ColorLUT } from '../../types/SegmentationStateTypes'
import { addColorLut } from './segmentationState'

const SEGMENTS_PER_SEGMENTATION = 65535 // Todo: max is bigger, but it seems cfun can go upto 255 anyway

/**
 * addColorLUT - Adds a new color LUT to the state at the given colorLUTIndex.
 * If no colorLUT is provided, a new color LUT is generated.
 *
 * @param  {number} colorLUTIndex the index of the colorLUT in the state
 * @param  {number[][]} [colorLUT] An array of The colorLUT to set.
 * @returns {null}
 */
export function addColorLUT(
  colorLUTIndex: number,
  colorLUT: ColorLUT = []
): void {
  if (colorLUT) {
    _checkColorLUTLength(colorLUT, SEGMENTS_PER_SEGMENTATION)

    if (colorLUT.length < SEGMENTS_PER_SEGMENTATION) {
      colorLUT = [
        ...colorLUT,
        ..._generateNewColorLUT(SEGMENTS_PER_SEGMENTATION - colorLUT.length),
      ]
    }
  } else {
    // Auto-generates colorLUT.
    colorLUT = colorLUT || _generateNewColorLUT(SEGMENTS_PER_SEGMENTATION)
  }

  // Append the "zero" (no label) color to the front of the LUT.
  colorLUT.unshift([0, 0, 0, 0])

  addColorLut(colorLUT, colorLUTIndex)
}

/**
 * Checks the length of `colorLUT` compared to `SEGMENTS_PER_SEGMENTATION` and flags up any warnings.
 * @param  {number[][]} colorLUT
 * @param  {number} SEGMENTS_PER_SEGMENTATION
 * @returns {boolean} Whether the length is valid.
 */
function _checkColorLUTLength(
  colorLUT: ColorLUT,
  SEGMENTS_PER_SEGMENTATION: number
) {
  if (colorLUT.length < SEGMENTS_PER_SEGMENTATION) {
    console.warn(
      `The provided colorLUT only provides ${colorLUT.length} labels, whereas SEGMENTS_PER_SEGMENTATION is set to ${SEGMENTS_PER_SEGMENTATION}. Autogenerating the rest.`
    )
  } else if (colorLUT.length > SEGMENTS_PER_SEGMENTATION) {
    console.warn(
      `SEGMENTS_PER_SEGMENTATION is set to ${SEGMENTS_PER_SEGMENTATION}, and the provided colorLUT provides ${colorLUT.length}. Using the first ${SEGMENTS_PER_SEGMENTATION} colors from the LUT.`
    )
  }
}

let hueValue = 222.5
let l = 0.6
const goldenAngle = 137.5
const maxL = 0.82
const minL = 0.3
const incL = 0.07

/**
 * Generates a new color LUT (Look Up Table) of length `numberOfColors`,
 * which returns an RGBA color for each segment index.
 *
 * @param  {Number} numberOfColors = 255 The number of colors to generate
 * @returns {Number[][]}           The array of RGB values.
 */
function _generateNewColorLUT(numberOfColors = 255) {
  const rgbArr = []

  // reset every time we generate new colorLUT to be consistent between csTools initializations
  hueValue = 222.5
  l = 0.6

  for (let i = 0; i < numberOfColors; i++) {
    rgbArr.push(getRGBAfromHSLA(getNextHue(), getNextL()))
  }

  return rgbArr
}

function getNextHue() {
  hueValue += goldenAngle

  if (hueValue >= 360) {
    hueValue -= 360
  }

  return hueValue
}

function getNextL() {
  l += incL

  if (l > maxL) {
    const diff = l - maxL

    l = minL + diff
  }

  return l
}

/**
 * GetRGBAfromHSL - Returns an RGBA color given H, S, L and A.
 *
 * @param  {Number} hue         The hue.
 * @param  {Number} s = 1       The saturation.
 * @param  {Number} l = 0.6     The lightness.
 * @param  {Number} alpha = 255 The alpha.
 * @returns {Number[]}            The RGBA formatted color.
 */
function getRGBAfromHSLA(hue, s = 1, l = 0.6, alpha = 255) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2

  let r, g, b

  if (hue < 60) {
    ;[r, g, b] = [c, x, 0]
  } else if (hue < 120) {
    ;[r, g, b] = [x, c, 0]
  } else if (hue < 180) {
    ;[r, g, b] = [0, c, x]
  } else if (hue < 240) {
    ;[r, g, b] = [0, x, c]
  } else if (hue < 300) {
    ;[r, g, b] = [x, 0, c]
  } else if (hue < 360) {
    ;[r, g, b] = [c, 0, x]
  }

  return [(r + m) * 255, (g + m) * 255, (b + m) * 255, alpha]
}
