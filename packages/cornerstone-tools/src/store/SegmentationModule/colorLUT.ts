import state, { Color, ColorLUT, getLabelmapStateForElement } from './state'
import config from './segmentationConfig'

/**
 * SetColorLUT - Sets the labelmap to a specific LUT, or generates a new LUT.
 *
 * @param  {number} labelmapIndex The labelmap index to apply the color LUT to.
 * @param  {number[][]} [colorLUT]    An array of The colorLUT to set.
 * @returns {null}
 */
export function setColorLUT(
  colorLUTIndex: number,
  colorLUT: ColorLUT = []
): void {
  const { segmentsPerLabelmap } = config

  if (colorLUT) {
    _checkColorLUTLength(colorLUT, segmentsPerLabelmap)

    if (colorLUT.length < segmentsPerLabelmap) {
      colorLUT = [
        ...colorLUT,
        ..._generateNewColorLUT(segmentsPerLabelmap - colorLUT.length),
      ]
    }
  } else {
    // Auto-generates colorLUT.
    colorLUT = colorLUT || _generateNewColorLUT(segmentsPerLabelmap)
  }

  // Append the "zero" (no label) color to the front of the LUT.
  colorLUT.unshift([0, 0, 0, 0])

  state.colorLutTables[colorLUTIndex] = colorLUT
}

export function setColorLUTIndexForLabelmap(labelmap, colorLUTIndex) {
  // Todo
  // labelmap3D.colorLUTIndex = colorLUTIndex
}

export function getColorForSegmentIndex(
  element: HTMLCanvasElement,
  segmentIndex: number,
  labelmapIndex?: number
): Color {
  const colorLUT = getColorLUT(element, labelmapIndex)
  return colorLUT[segmentIndex]
}

/**
 * Sets a single color of a colorLUT.
 *
 * @param {Object|number} labelmap3DOrColorLUTIndex Either a `Labelmap3D` object (who's referenced colorLUT will be changed), or a colorLUTIndex.
 * @param {number} segmentIndex The segmentIndex color to change.
 * @param {number[]} colorArray The color values in RGBA array format (required length 4).
 */
export function setColorForSegmentIndexOfColorLUT(
  labelmapOrColorLUTIndex,
  segmentIndex,
  colorArray
) {
  // Todo
  // const colorLUT = getColorLUT(labelmapOrColorLUTIndex)
  // colorLUT[segmentIndex] = colorArray
}

export function getColorLUT(
  element: HTMLCanvasElement,
  labelmapIndex?: number
): ColorLUT {
  const viewportLabelmapState = getLabelmapStateForElement(
    element,
    labelmapIndex
  )
  return state.colorLutTables[viewportLabelmapState.colorLUTIndex]
}

/**
 * Checks the length of `colorLUT` compared to `segmentsPerLabelmap` and flags up any warnings.
 * @param  {number[][]} colorLUT
 * @param  {number} segmentsPerLabelmap
 * @returns {boolean} Whether the length is valid.
 */
function _checkColorLUTLength(colorLUT: ColorLUT, segmentsPerLabelmap: number) {
  if (colorLUT.length < segmentsPerLabelmap) {
    console.warn(
      `The provided colorLUT only provides ${colorLUT.length} labels, whereas segmentsPerLabelmap is set to ${segmentsPerLabelmap}. Autogenerating the rest.`
    )
  } else if (colorLUT.length > segmentsPerLabelmap) {
    console.warn(
      `segmentsPerLabelmap is set to ${segmentsPerLabelmap}, and the provided colorLUT provides ${colorLUT.length}. Using the first ${segmentsPerLabelmap} colors from the LUT.`
    )
  }
}

/**
 * Generates a new color LUT (Look Up Table) of length `numberOfColors`,
 * which returns an RGBA color for each segment index.
 *
 * @param  {Number} numberOfColors = 255 The number of colors to generate
 * @returns {Number[][]}           The array of RGB values.
 */
function _generateNewColorLUT(numberOfColors = 255) {
  const rgbArr = []

  for (let i = 0; i < numberOfColors; i++) {
    rgbArr.push(getRGBAfromHSLA(getNextHue(), getNextL()))
  }

  return rgbArr
}

const goldenAngle = 137.5
let hueValue = 222.5

function getNextHue() {
  hueValue += goldenAngle

  if (hueValue >= 360) {
    hueValue -= 360
  }

  return hueValue
}

let l = 0.6
const maxL = 0.82
const minL = 0.3
const incL = 0.07

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
