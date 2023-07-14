import { IImage } from '../../types';
import createVTKImageData from './createVTKImageData';
import { getMetadataFromImage } from './getMetadataFromImage';
import cache from '../../cache';

export default function createVTKImageDataFromImage(image: IImage) {
  const { origin, direction, dimensions, spacing } =
    getMetadataFromImage(image);

  const imagedata = createVTKImageData({
    origin,
    direction,
    dimensions,
    spacing,
    numComps: 1,
    pixelArray: image.getPixelData(),
  });
  return imagedata;
}

export function createVTKImageDataFromImageId(imageId) {
  const image = cache.getImage(imageId);
  const imageData = createVTKImageDataFromImage(image);
  return imageData;
}
