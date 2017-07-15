/* eslint no-bitwise: 0 */
function getBytesForBinaryFrame (numPixels) {
  // Check whether the 1-bit pixels exactly fit into bytes
  const remainder = numPixels % 8;

  // Number of bytes that work on an exact fit
  let bytesRequired = Math.floor(numPixels / 8);

  // Add one byte if we have a remainder
  if (remainder > 0) {
    bytesRequired++;
  }

  return bytesRequired;
}

function packBitArray (pixelData) {
  const numPixels = pixelData.length;
  console.log('numPixels: ' + numPixels);

  const length = getBytesForBinaryFrame(numPixels);
  //console.log('getBytesForBinaryFrame: ' + length);

  const bitPixelData = new Uint8Array(length);

  let bytePos = 0;

  for (let i = 0; i < numPixels; i++) {
    // Compute byte position
    bytePos = Math.floor(i / 8);

    const pixValue = (pixelData[i] !== 0);

    //console.log('i: ' + i);
    //console.log('pixValue: ' + pixValue);
    //console.log('bytePos: ' + bytePos);

    const bitPixelValue = pixValue << (i % 8);
    //console.log('current bitPixelData: ' + bitPixelData[bytePos]);
    //console.log('this bitPixelValue: ' + bitPixelValue);

    bitPixelData[bytePos] |= bitPixelValue;

    //console.log('new bitPixelValue: ' + bitPixelData[bytePos]);
  }

  return bitPixelData;
}

export { packBitArray };
