export default function(imageFrame, rgbaBuffer) {
  if (imageFrame === undefined) {
    throw new Error('decodeRGB: rgbBuffer must not be undefined');
  }
  if (imageFrame.length % 3 !== 0) {
    throw new Error('decodeRGB: rgbBuffer length must be divisible by 3');
  }

  const numPixels = imageFrame.length / 3;

  let rgbaIndex = 0;

  let rIndex = 0;

  let gIndex = numPixels;

  let bIndex = numPixels * 2;

  for (let i = 0; i < numPixels; i++) {
    rgbaBuffer[rgbaIndex++] = imageFrame[rIndex++]; // red
    rgbaBuffer[rgbaIndex++] = imageFrame[gIndex++]; // green
    rgbaBuffer[rgbaIndex++] = imageFrame[bIndex++]; // blue
    rgbaBuffer[rgbaIndex++] = 255; // alpha
  }
}
