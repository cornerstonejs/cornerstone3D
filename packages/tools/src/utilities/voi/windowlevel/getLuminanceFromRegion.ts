/**
 * Extracts the luminance values from a specified region of an image.
 *
 * @param {Object} imageData - The image data object containing pixel information.
 * @param {Uint8Array} imageData.scalarData - The pixel data array.
 * @param {boolean} imageData.color - A flag indicating if the image is in color (true) or grayscale (false).
 * @param {number} imageData.columns - The number of columns (width) in the image.
 * @param {number} x - The x-coordinate of the top-left corner of the region.
 * @param {number} y - The y-coordinate of the top-left corner of the region.
 * @param {number} width - The width of the region.
 * @param {number} height - The height of the region.
 * @returns {number[]} An array containing the luminance values of the specified region.
 */
function getLuminanceFromRegion(imageData, x, y, width, height) {
  const luminance = [];
  let index = 0;
  const pixelData = imageData.scalarData;
  let spIndex, row, column;

  if (imageData.color) {
    for (row = 0; row < height; row++) {
      for (column = 0; column < width; column++) {
        spIndex = ((row + y) * imageData.columns + (column + x)) * 4;
        const red = pixelData[spIndex];
        const green = pixelData[spIndex + 1];
        const blue = pixelData[spIndex + 2];

        luminance[index++] = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      }
    }
  } else {
    for (row = 0; row < height; row++) {
      for (column = 0; column < width; column++) {
        spIndex = (row + y) * imageData.columns + (column + x);
        luminance[index++] = pixelData[spIndex];
      }
    }
  }

  return luminance;
}

export { getLuminanceFromRegion };
