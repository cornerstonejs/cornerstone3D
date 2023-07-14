import { IImage } from 'core/src/types';
import updateVTKImageDataFromCornerstoneImage from './updateVTKImageDataFromCornerstoneImage';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import cache from '../../cache';

export default function updateVTKImageDataFromImage(
  image: IImage,
  imageData: vtkImageData
): void {
  updateVTKImageDataFromCornerstoneImage(image, imageData);
}

export function updateVTKImageDataFromImageId(
  imageId: string,
  imageData: vtkImageData
): void {
  const image = cache.getImage(imageId);
  updateVTKImageDataFromImage(image, imageData);
}
