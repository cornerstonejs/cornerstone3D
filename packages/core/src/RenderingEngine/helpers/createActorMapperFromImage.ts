import createActorMapper from './createActorMapper';
import { IImage } from '../../types';
import createVTKImageDataFromImage from './createVTKImageDataFromImage';
import { getMetadataFromImage } from './getMetadataFromImage';
import { getSegmentationImageFromImageId } from './getDerivedImage';

export default function createActorMapperFromImage(image: IImage) {
  const { origin, direction, dimensions, spacing } =
    getMetadataFromImage(image);
  const segmentationImageData = createVTKImageDataFromImage(image, {
    origin,
    direction,
    dimensions,
    spacing,
  });

  const segmentationActor = createActorMapper(segmentationImageData);
  return { segmentationActor, segmentationImageData };
}

export function createActorMapperFromImageId(imageId) {
  const cachedImage = getSegmentationImageFromImageId(imageId);
  return createActorMapperFromImage(cachedImage.image);
}
