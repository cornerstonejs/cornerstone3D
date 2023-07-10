import createActorMapper from './createActorMapper';
import setDerivedColorMap from './setDerivedColorMap';
import { IImage } from '../../types';
import createDerivedVTKImageData from './createDerivedVTKImageData';
import { getMetadataFromImage } from './getMetadataFromImage';
import getDerivedImage from './getDerivedImage';

export default function createDerivedActorMapper(image: IImage) {
  if (getDerivedImage(image)) {
    const { origin, direction, dimensions, spacing } =
      getMetadataFromImage(image);
    const derivedImageData = createDerivedVTKImageData(image, {
      origin,
      direction,
      dimensions,
      spacing,
    });

    const derivedActor = createActorMapper(derivedImageData);
    setDerivedColorMap(derivedActor);
    return { derivedActor, derivedImageData };
  }
}
