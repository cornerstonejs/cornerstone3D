import cache from '../../cache';
import { IImage, ICachedImage } from '../../types';
import { imageIdToURI } from '../../utilities';

export default function getDerivedImage(image: IImage): ICachedImage {
  const imageId = 'stackSeg:derived_' + imageIdToURI(image.imageId);
  return cache.getCachedImageBasedOnImageURI(imageId);
}
