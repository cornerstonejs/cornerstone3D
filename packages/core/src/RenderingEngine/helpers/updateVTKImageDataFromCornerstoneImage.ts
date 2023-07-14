import { IImage } from 'core/src/types';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import updatePixelData from './updatePixelData';
import { metaData } from '../..';

/**
 * It Updates the vtkImageData of the viewport with the new pixel data
 * from the provided image object.
 *
 * @param imageId - image Id of the referenced iamge
 * @param image - Cornerstone Image object
 * @param imageData - VTKImage data object
 */

export default function updateVTKImageDataFromCornerstoneImage(
  image: IImage,
  imageData: vtkImageData
): void {
  const { imagePositionPatient } = metaData.get(
    'imagePlaneModule',
    image?.referenceImageId || image.imageId
  );
  let origin = imagePositionPatient;

  if (origin == null) {
    origin = [0, 0, 0];
  }

  imageData.setOrigin(origin);

  // Update the pixel data in the vtkImageData object with the pixelData
  // from the loaded Cornerstone image
  updatePixelData(image, imageData);
}
