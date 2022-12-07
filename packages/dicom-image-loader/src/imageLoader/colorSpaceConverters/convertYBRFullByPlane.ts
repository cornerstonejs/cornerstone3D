export default function (imageFrame, colorBuffer, useRGBA) {
  if (imageFrame === undefined) {
    throw new Error('decodeRGB: ybrBuffer must not be undefined');
  }
  if (imageFrame.length % 3 !== 0) {
    throw new Error('decodeRGB: ybrBuffer length must be divisble by 3');
  }

  const numPixels = imageFrame.length / 3;

  let bufferIndex = 0;

  let yIndex = 0;

  let cbIndex = numPixels;

  let crIndex = numPixels * 2;

  if (useRGBA) {
    for (let i = 0; i < numPixels; i++) {
      const y = imageFrame[yIndex++];
      const cb = imageFrame[cbIndex++];
      const cr = imageFrame[crIndex++];

      colorBuffer[bufferIndex++] = y + 1.402 * (cr - 128); // red
      colorBuffer[bufferIndex++] =
        y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128); // green
      colorBuffer[bufferIndex++] = y + 1.772 * (cb - 128); // blue
      colorBuffer[bufferIndex++] = 255; // alpha
    }

    return;
  }

  for (let i = 0; i < numPixels; i++) {
    const y = imageFrame[yIndex++];
    const cb = imageFrame[cbIndex++];
    const cr = imageFrame[crIndex++];

    colorBuffer[bufferIndex++] = y + 1.402 * (cr - 128); // red
    colorBuffer[bufferIndex++] =
      y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128); // green
    colorBuffer[bufferIndex++] = y + 1.772 * (cb - 128); // blue
  }
}
