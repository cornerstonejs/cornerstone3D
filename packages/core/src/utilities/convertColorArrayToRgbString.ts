/**
 * Converts a color array [r, g, b] (values 0-1) to an RGB string.
 * If the input is already a string, it returns it as-is.
 *
 * @param colorArr - Color as array [r, g, b] or RGB string
 * @returns RGB string in format "rgb(r, g, b)"
 */
export function convertColorArrayToRgbString(
  colorArr: number[] | string
): string {
  return Array.isArray(colorArr)
    ? `rgb(${colorArr.map((v) => Math.round(v * 255)).join(',')})`
    : colorArr;
}
