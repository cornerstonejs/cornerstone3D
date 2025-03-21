import now from './now';
export default function (image, lut, canvasImageDataData) {
  let start = now();
  const pixelData = image.voxelManager.getScalarData();
  image.stats.lastGetPixelDataTime = now() - start;
  const numPixels = pixelData.length;
  const minPixelValue = image.minPixelValue;
  let canvasImageDataIndex = 0;
  let storedPixelDataIndex = 0;
  start = now();
  if (pixelData instanceof Int16Array) {
    if (minPixelValue < 0) {
      while (storedPixelDataIndex < numPixels) {
        const storeValue =
          lut[pixelData[storedPixelDataIndex++] + -minPixelValue];
        canvasImageDataData[canvasImageDataIndex++] = storeValue;
        canvasImageDataData[canvasImageDataIndex++] = storeValue;
        canvasImageDataData[canvasImageDataIndex++] = storeValue;
        canvasImageDataData[canvasImageDataIndex++] = 255;
      }
    } else {
      while (storedPixelDataIndex < numPixels) {
        const storeValue = lut[pixelData[storedPixelDataIndex++]];
        canvasImageDataData[canvasImageDataIndex++] = storeValue;
        canvasImageDataData[canvasImageDataIndex++] = storeValue;
        canvasImageDataData[canvasImageDataIndex++] = storeValue;
        canvasImageDataData[canvasImageDataIndex++] = 255;
      }
    }
  } else if (pixelData instanceof Uint16Array) {
    while (storedPixelDataIndex < numPixels) {
      const storeValue = lut[pixelData[storedPixelDataIndex++]];
      canvasImageDataData[canvasImageDataIndex++] = storeValue;
      canvasImageDataData[canvasImageDataIndex++] = storeValue;
      canvasImageDataData[canvasImageDataIndex++] = storeValue;
      canvasImageDataData[canvasImageDataIndex++] = 255;
    }
  } else if (minPixelValue < 0) {
    while (storedPixelDataIndex < numPixels) {
      const storeValue =
        lut[pixelData[storedPixelDataIndex++] + -minPixelValue];
      canvasImageDataData[canvasImageDataIndex++] = storeValue;
      canvasImageDataData[canvasImageDataIndex++] = storeValue;
      canvasImageDataData[canvasImageDataIndex++] = storeValue;
      canvasImageDataData[canvasImageDataIndex++] = 255;
    }
  } else {
    while (storedPixelDataIndex < numPixels) {
      const storeValue = lut[pixelData[storedPixelDataIndex++]];
      canvasImageDataData[canvasImageDataIndex++] = storeValue;
      canvasImageDataData[canvasImageDataIndex++] = storeValue;
      canvasImageDataData[canvasImageDataIndex++] = storeValue;
      canvasImageDataData[canvasImageDataIndex++] = 255;
    }
  }
  image.stats.lastStoredPixelDataToCanvasImageDataTime = now() - start;
}
