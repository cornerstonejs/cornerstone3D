function componentToHex(c) {
  const hex = c.toString(16);
  return hex.length == 1 ? '0' + hex : hex;
}

/**
 * Converts RGB color values to a hexadecimal color string.
 * @param r - The red component value (0-255).
 * @param g - The green component value (0-255).
 * @param b - The blue component value (0-255).
 * @returns The hexadecimal color string representation.
 */
function rgbToHex(r, g, b) {
  return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

/**
 * Converts a hexadecimal color code to an RGB object.
 * @param hex - The hexadecimal color code to convert.
 * @returns An object representing the RGB values of the color, or null if the input is invalid.
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

export { hexToRgb, rgbToHex };
