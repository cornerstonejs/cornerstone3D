import { IImage } from '../../types';
import createVTKImageData from './createVTKImageData';
import { getSegmentationImageFromImageId } from './getDerivedImage';
import { getMetadataFromImage } from './getMetadataFromImage';

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
  const image = getSegmentationImageFromImageId(imageId);
  return createVTKImageDataFromImage(image);
}
