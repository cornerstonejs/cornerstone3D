export default function (imageFrame, rgbaBuffer) {
  if (imageFrame === undefined) {
    throw new Error('decodeRGB: ybrBuffer must not be undefined');
  }
  if (imageFrame.length % 2 !== 0) {
    throw new Error('decodeRGB: ybrBuffer length must be divisble by 3');
  }

  const numPixels = imageFrame.length / 2;

  let ybrIndex = 0;

  let rgbaIndex = 0;

  for (let i = 0; i < numPixels; i += 2) {
    const y1 = imageFrame[ybrIndex++];
    const y2 = imageFrame[ybrIndex++];
    const cb = imageFrame[ybrIndex++];
    const cr = imageFrame[ybrIndex++];

    rgbaBuffer[rgbaIndex++] = y1 + 1.402 * (cr - 128); // red
    rgbaBuffer[rgbaIndex++] = y1 - 0.34414 * (cb - 128) - 0.71414 * (cr - 128); // green
    rgbaBuffer[rgbaIndex++] = y1 + 1.772 * (cb - 128); // blue
    rgbaBuffer[rgbaIndex++] = 255; // alpha

    rgbaBuffer[rgbaIndex++] = y2 + 1.402 * (cr - 128); // red
    rgbaBuffer[rgbaIndex++] = y2 - 0.34414 * (cb - 128) - 0.71414 * (cr - 128); // green
    rgbaBuffer[rgbaIndex++] = y2 + 1.772 * (cb - 128); // blue
    rgbaBuffer[rgbaIndex++] = 255; // alpha
  }
}
