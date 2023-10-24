/**
 * Performs a bilinear scaling, both scaling up and scaling down.
 * Only supports 1 channel per pixel (grayscale)
 * @param src - src image frame to get map from
 * @param dest - dest image frame to write to
 * @returns destination data buffer
 */
export default function bilinear(src, dest) {
  const { rows: srcRows, columns: srcColumns, data: srcData } = src;
  const { rows, columns, data } = dest;

  const xSrc1Off = [];
  const xSrc2Off = [];
  const xFrac = [];

  // Precompute offsets
  for (let x = 0; x < columns; x++) {
    const xSrc = (x * (srcColumns - 1)) / (columns - 1);
    xSrc1Off[x] = Math.floor(xSrc);
    xSrc2Off[x] = Math.min(xSrc1Off[x] + 1, srcColumns - 1);
    xFrac[x] = xSrc - xSrc1Off[x];
    // console.log("x src info", x, xSrc, xFrac[x]);
  }

  for (let y = 0; y < rows; y++) {
    const ySrc = (y * (srcRows - 1)) / (rows - 1);
    const ySrc1Off = Math.floor(ySrc) * srcColumns;
    // Get the second offset, but duplicate the last row so the lookup works
    const ySrc2Off = Math.min(
      ySrc1Off + srcColumns,
      (srcRows - 1) * srcColumns
    );
    const yFrac = ySrc - Math.floor(ySrc);
    const yFracInv = 1 - yFrac;
    const yOff = y * columns;

    for (let x = 0; x < columns; x++) {
      // TODO - put the pXY into the data calculation
      const p00 = srcData[ySrc1Off + xSrc1Off[x]];
      const p10 = srcData[ySrc1Off + xSrc2Off[x]];
      const p01 = srcData[ySrc2Off + xSrc1Off[x]];
      const p11 = srcData[ySrc2Off + xSrc2Off[x]];
      const xFracInv = 1 - xFrac[x];

      //   console.log("bilinear for", x,y, "from", ySrc1Off + xSrc1Off[x], ySrc1Off + xSrc2Off[x], ySrc2Off + xSrc1Off[x], ySrc2Off + xSrc2Off[x]);
      //   console.log("values", p00, p10, p01, p11);
      //   console.log("fractions", xFracInv, xFrac[x], yFracInv, yFrac);

      data[yOff + x] =
        (p00 * xFracInv + p10 * xFrac[x]) * yFracInv +
        (p01 * xFracInv + p11 * xFrac[x]) * yFrac;
    }
  }
  return data;
}
