/** Handle replicate scaling.  Use this function for samplesPerPixel>1 */

export default function replicate(src, dest) {
  const {
    rows: srcRows,
    columns: srcColumns,
    pixelData: srcData,
    samplesPerPixel = 1,
  } = src;
  const { rows, columns, pixelData } = dest;

  const xSrc1Off = [];

  // Precompute offsets
  for (let x = 0; x < columns; x++) {
    const xSrc = (x * (srcColumns - 1)) / (columns - 1);
    xSrc1Off[x] = Math.floor(xSrc) * samplesPerPixel;
    // console.log("x src info", x, xSrc, xFrac[x]);
  }

  for (let y = 0; y < rows; y++) {
    const ySrc = (y * (srcRows - 1)) / (rows - 1);
    const ySrc1Off = Math.floor(ySrc) * srcColumns * samplesPerPixel;
    const yOff = y * columns;

    for (let x = 0; x < columns; x++) {
      for (let sample = 0; sample < samplesPerPixel; sample++) {
        pixelData[yOff + x + sample] = srcData[ySrc1Off + xSrc1Off[x] + sample];
      }
    }
  }
  return pixelData;
}
