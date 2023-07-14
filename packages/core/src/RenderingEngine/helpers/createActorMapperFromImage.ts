import createActorMapper from './createActorMapper';
import { IImage } from '../../types';
import createVTKImageDataFromImage from './createVTKImageDataFromImage';
import cache from '../../cache';

export default function createActorMapperFromImage(image: IImage) {
  const imageData = createVTKImageDataFromImage(image);
  const imageActor = createActorMapper(imageData);
  return { imageActor, imageData };
}

export function createActorMapperFromImageId(imageId) {
  const image = cache.getImage(imageId);
  return createActorMapperFromImage(image);
}
