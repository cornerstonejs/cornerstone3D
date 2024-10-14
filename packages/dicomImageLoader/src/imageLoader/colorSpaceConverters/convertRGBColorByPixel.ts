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

  let rgbIndex = 0;

  let bufferIndex = 0;

  if (useRGBA) {
    for (let i = 0; i < numPixels; i++) {
      colorBuffer[bufferIndex++] = imageFrame[rgbIndex++]; // red
      colorBuffer[bufferIndex++] = imageFrame[rgbIndex++]; // green
      colorBuffer[bufferIndex++] = imageFrame[rgbIndex++]; // blue
      colorBuffer[bufferIndex++] = 255; // alpha
    }

    return;
  }

  // if RGB buffer
  colorBuffer.set(imageFrame);
}
