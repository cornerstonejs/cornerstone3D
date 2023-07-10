import { IImage } from 'core/src/types';
import updateVTKImageDataFromCornerstoneImage from './updateVTKImageDataFromCornerstoneImage';
import getDerivedImage from './getDerivedImage';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

export default function updateDerivedVTKImageData(
  image: IImage,
  derivedImageData: vtkImageData
): void {
  const derivedImage = getDerivedImage(image);
  if (derivedImage) {
    updateVTKImageDataFromCornerstoneImage(
      image.imageId,
      derivedImage.image,
      derivedImageData
    );
  }
}
