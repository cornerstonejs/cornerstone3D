import cache from '../../cache';
import { IImage, ICachedImage } from '../../types';
import { imageIdToURI } from '../../utilities';

export default function getSegmentationImage(image: IImage): IImage {
  return getSegmentationImageFromImageId(image.imageId);
}

export function getSegmentationImageFromImageId(imageId: string): IImage {
  return cache.getDerivedImage(imageId);
}
