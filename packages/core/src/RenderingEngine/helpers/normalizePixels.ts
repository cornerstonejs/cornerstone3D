import { IImage } from '../../types';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import generateLut from './cpuFallback/rendering/generateLut';

export function normalizePixels(vtkImage: vtkImageData, image: IImage): any {
  const { windowCenter, windowWidth } = image;
  const width = Array.isArray(windowWidth) ? windowWidth[0] : windowWidth;
  const center = Array.isArray(windowCenter) ? windowCenter[0] : windowCenter;

  const lut = generateLut(image, width, center, false, undefined, undefined);
  const pixelData = image.getPixelData();

  const numPixels = pixelData.length;
  const minPixelValue = image.minPixelValue;
  let storedPixelDataIndex = 0;

  const numComp = vtkImage.getPointData().getNumberOfComponents();
  const textureData = new Float32Array(numPixels);
  for (let i = 0; i < numPixels; i++) {
    textureData[i * numComp] = 255; // Red
    textureData[i * numComp + 1] = 255; // Green
    textureData[i * numComp + 2] = 255; // Blue
    textureData[i * numComp + 3] = 255; // Alpha
  }

  if (pixelData instanceof Float32Array) {
    while (storedPixelDataIndex < numPixels) {
      if (minPixelValue < 0) {
        textureData[storedPixelDataIndex * numComp + 3] =
          lut[pixelData[storedPixelDataIndex++] + -minPixelValue]; // Alpha
      } else {
        textureData[storedPixelDataIndex * numComp + 3] =
          lut[pixelData[storedPixelDataIndex++]]; // Alpha
      }
    }
  } else {
    while (storedPixelDataIndex < numPixels) {
      textureData[storedPixelDataIndex * numComp + 3] =
        lut[pixelData[storedPixelDataIndex++]]; // Alpha
    }
  }

  const dataArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: numComp,
    values: textureData,
  });

  return dataArray;
}
