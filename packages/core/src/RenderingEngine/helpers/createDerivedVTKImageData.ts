import { IImage } from '../../types';
import getDerivedImage from './getDerivedImage';
import createVTKImageData from './createVTKImageData';

export default function createDerivedVTKImageData(
  image: IImage,
  { origin, direction, dimensions, spacing }
) {
  const derivedImage = getDerivedImage(image);
  if (derivedImage) {
    const imagedata = createVTKImageData({
      origin,
      direction,
      dimensions,
      spacing,
      numComps: 1,
      pixelArray: derivedImage.image.getPixelData(),
    });
    return imagedata;
  }
}
