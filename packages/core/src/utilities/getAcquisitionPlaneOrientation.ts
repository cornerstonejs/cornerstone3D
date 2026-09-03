import type { IImageVolume, OrientationVectors, Point3 } from '../types';

export default function getAcquisitionPlaneOrientation(
  imageVolume: IImageVolume
): OrientationVectors {
  const { direction } = imageVolume;

  return {
    viewPlaneNormal: direction.slice(6, 9).map((x) => -x) as Point3,
    viewUp: direction.slice(3, 6).map((x) => -x) as Point3,
  };
}
