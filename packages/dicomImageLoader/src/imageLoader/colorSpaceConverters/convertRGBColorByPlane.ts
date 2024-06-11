import { ByteArray } from 'dicom-parser';

export default function (
  imageFrame: ByteArray,
  colorBuffer: ByteArray,
  useRGBA: boolean
): void {
  if (imageFrame === undefined) {
    throw new Error('decodeRGB: rgbBuffer must be defined');
  }
  if (imageFrame.length % 3 !== 0) {
    throw new Error(
      `decodeRGB: rgbBuffer length ${imageFrame.length} must be divisible by 3`
    );
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
  } else {
    for (let i = 0; i < numPixels; i++) {
      colorBuffer[bufferIndex++] = imageFrame[rIndex++]; // red
      colorBuffer[bufferIndex++] = imageFrame[gIndex++]; // green
      colorBuffer[bufferIndex++] = imageFrame[bIndex++]; // blue
    }
  }
}
