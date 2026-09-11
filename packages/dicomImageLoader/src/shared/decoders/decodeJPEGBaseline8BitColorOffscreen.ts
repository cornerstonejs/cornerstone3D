import type { ByteArray } from 'dicom-parser';
import type { Types } from '@cornerstonejs/core';
import getMinMax from '../getMinMax';

async function decodeJPEGBaseline8BitColorOffscreen(
  imageFrame: Types.IImageFrame,
  pixelData: ByteArray
): Promise<Types.IImageFrame> {
  const blob = new Blob([pixelData], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    bitmap.close();
    throw new Error('Failed to obtain OffscreenCanvas 2D context');
  }

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgbaPixels = new Uint8Array(imageData.data);
  const { min, max } = getMinMax(rgbaPixels);

  imageFrame.rows = canvas.height;
  imageFrame.columns = canvas.width;
  imageFrame.pixelData = rgbaPixels;
  imageFrame.pixelDataLength = rgbaPixels.length;
  imageFrame.smallestPixelValue = min;
  imageFrame.largestPixelValue = max;
  imageFrame.imageData = imageData;

  return imageFrame;
}

export default decodeJPEGBaseline8BitColorOffscreen;
