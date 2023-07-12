import createActorMapper from './createActorMapper';
import { IImage } from '../../types';
import createVTKImageDataFromImage from './createVTKImageDataFromImage';
import { getSegmentationImageFromImageId } from './getDerivedImage';

export default function createActorMapperFromImage(image: IImage) {
  const imageData = createVTKImageDataFromImage(image);
  const imageActor = createActorMapper(imageData);
  return { imageActor, imageData };
}

export function createActorMapperFromImageId(imageId) {
  const image = getSegmentationImageFromImageId(imageId);
  return createActorMapperFromImage(image);
}
