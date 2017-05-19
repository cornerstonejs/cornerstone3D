

function convertYBRFullByPixel (imageFrame, rgbaBuffer) {
  if (imageFrame === undefined) {
    throw 'decodeRGB: ybrBuffer must not be undefined';
  }
  if (imageFrame.length % 3 !== 0) {
    throw 'decodeRGB: ybrBuffer length must be divisble by 3';
  }

  const numPixels = imageFrame.length / 3;
  let ybrIndex = 0;
  let rgbaIndex = 0;

  for (let i = 0; i < numPixels; i++) {
    const y = imageFrame[ybrIndex++];
    const cb = imageFrame[ybrIndex++];
    const cr = imageFrame[ybrIndex++];

    rgbaBuffer[rgbaIndex++] = y + 1.40200 * (cr - 128);// red
    rgbaBuffer[rgbaIndex++] = y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128); // green
    rgbaBuffer[rgbaIndex++] = y + 1.77200 * (cb - 128); // blue
    rgbaBuffer[rgbaIndex++] = 255; // alpha
  }
}

export default convertYBRFullByPixel;
