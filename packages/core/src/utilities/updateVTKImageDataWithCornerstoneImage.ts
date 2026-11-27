import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { IImage, PixelDataTypedArray } from '../types';
import { normalizeRGBAImageToRGB } from './normalizeRGBAImageToRGB';

function updateVTKImageDataWithCornerstoneImage(
  sourceImageData: vtkImageData,
  image: IImage
) {
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
  // pixel data. Only do it for an RGB destination, a 4-component
  // vtkImageData takes the RGBA data as is.
  if (scalarData.length === image.columns * image.rows * 3) {
    normalizeRGBAImageToRGB(image);
  }

  scalarData.set(image.voxelManager.getScalarData());

  // Trigger modified on the VTK Object so the texture is updated
  // TODO: evaluate directly changing things with texSubImage3D later
  sourceImageData.modified();
}

export { updateVTKImageDataWithCornerstoneImage };
