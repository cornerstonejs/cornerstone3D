import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { IImage, PixelDataTypedArray } from '../types';

function updateVTKImageDataWithCornerstoneImage(
  sourceImageData: vtkImageData,
  image: IImage
) {
  const pixelData = image.getPixelData();
  if (!sourceImageData.getPointData) {
    // This happens for a CanvasActor, that doesn't have the getPointData
    return;
  }
  const scalarData = sourceImageData
    .getPointData()
    .getScalars()
    .getData() as PixelDataTypedArray;

  // if the color image is loaded with CPU previously, it loads it
  // with RGBA, and here we need to remove the A channel from the
  // pixel data.
  if (image.color && image.rgba) {
    const newPixelData = new Uint8Array(image.columns * image.rows * 3);
    for (let i = 0; i < image.columns * image.rows; i++) {
      newPixelData[i * 3] = pixelData[i * 4];
      newPixelData[i * 3 + 1] = pixelData[i * 4 + 1];
      newPixelData[i * 3 + 2] = pixelData[i * 4 + 2];
    }
    // modify the image object to have the correct pixel data for later
    // use.
    image.rgba = false;
    image.getPixelData = () => newPixelData;
    scalarData.set(newPixelData);
  } else {
    scalarData.set(pixelData);
  }

  // Trigger modified on the VTK Object so the texture is updated
  // TODO: evaluate directly changing things with texSubImage3D later
  sourceImageData.modified();
}

export { updateVTKImageDataWithCornerstoneImage };
