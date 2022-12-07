export default function (imageFrame, colorBuffer, useRGBA) {
  if (imageFrame === undefined) {
    throw new Error('decodeRGB: rgbBuffer must not be undefined');
  }
  if (imageFrame.length % 3 !== 0) {
    throw new Error('decodeRGB: rgbBuffer length must be divisible by 3');
  }

  const numPixels = imageFrame.length / 3;

  let bufferIndex = 0;

  let rIndex = 0;

  let gIndex = numPixels;

  let bIndex = numPixels * 2;

  if (useRGBA) {
    for (let i = 0; i < numPixels; i++) {
      colorBuffer[bufferIndex++] = imageFrame[rIndex++]; // red
      colorBuffer[bufferIndex++] = imageFrame[gIndex++]; // green
      colorBuffer[bufferIndex++] = imageFrame[bIndex++]; // blue
      colorBuffer[bufferIndex++] = 255; // alpha
    }

    return;
  }

  // if RGB buffer
  colorBuffer.set(imageFrame);
}
