import { IImage } from '../../types';
import createVTKImageData from './createVTKImageData';

export default function createVTKImageDataFromImage(
  image: IImage,
  { origin, direction, dimensions, spacing }
) {
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
