import { IImage } from 'core/src/types';
import updateVTKImageDataFromCornerstoneImage from './updateVTKImageDataFromCornerstoneImage';
import { getSegmentationImageFromImageId } from './getDerivedImage';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

export default function updateVTKImageDataFromImage(
  image: IImage,
  imageData: vtkImageData
): void {
  updateVTKImageDataFromCornerstoneImage(
    image?.referenceImageId || image.imageId,
    image,
    imageData
  );
}

export function updateVTKImageDataFromImageId(
  imageId: string,
  imageData: vtkImageData
): void {
  const segmentationImage = getSegmentationImageFromImageId(imageId);
  updateVTKImageDataFromImage(segmentationImage.image, imageData);
}
