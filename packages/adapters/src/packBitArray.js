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

packBitArray = function(pixelData) {
  const numPixels = pixelData.length;
  const length = getBytesForBinaryFrame(numPixels);
  const bitPixelData = new Uint8Array(length);

  let bytePos = 0;

  for (let count = 0; count < numPixels; count++) {
    // Compute byte position
    bytePos = Math.floor(count / 8);

    const pixValue = (bitPixelData[count] !== 0);

    bitPixelData[bytePos] |= pixValue << (count % 8);
  }

  return pixelData;
}