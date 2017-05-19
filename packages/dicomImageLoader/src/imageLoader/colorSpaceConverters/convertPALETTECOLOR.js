/* eslint no-bitwise: 0 */

function convertPALETTECOLOR (imageFrame, rgbaBuffer) {
  const numPixels = imageFrame.columns * imageFrame.rows;
  let palIndex = 0;
  let rgbaIndex = 0;
  const pixelData = imageFrame.pixelData;
  const start = imageFrame.redPaletteColorLookupTableDescriptor[1];
  const rData = imageFrame.redPaletteColorLookupTableData;
  const gData = imageFrame.greenPaletteColorLookupTableData;
  const bData = imageFrame.bluePaletteColorLookupTableData;
  const shift = imageFrame.redPaletteColorLookupTableDescriptor[2] === 8 ? 0 : 8;
  let len = imageFrame.redPaletteColorLookupTableData.length;

  if (len === 0) {
    len = 65535;
  }

  for (let i = 0; i < numPixels; ++i) {
    let value = pixelData[palIndex++];

    if (value < start) {
      value = 0;
    } else if (value > start + len - 1) {
      value = len - 1;
    } else {
      value -= start;
    }

    rgbaBuffer[rgbaIndex++] = rData[value] >> shift;
    rgbaBuffer[rgbaIndex++] = gData[value] >> shift;
    rgbaBuffer[rgbaIndex++] = bData[value] >> shift;
    rgbaBuffer[rgbaIndex++] = 255;
  }
}

export default convertPALETTECOLOR;
