import cache from '../../cache';
import { IImage, ICachedImage } from '../../types';
import { imageIdToURI } from '../../utilities';

export default function getSegmentationImage(image: IImage): ICachedImage {
  const imageId = 'stackSeg:derived_' + imageIdToURI(image.imageId);
  return cache.getCachedImageBasedOnImageURI(imageId);
}

export function getSegmentationImageFromImageId(imageId: string): ICachedImage {
  const segmentationImageId = 'stackSeg:derived_' + imageIdToURI(imageId);
  return cache.getCachedImageBasedOnImageURI(segmentationImageId);
}
