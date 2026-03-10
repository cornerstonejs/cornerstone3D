import { MPR_CAMERA_VALUES } from '../../../constants';
import { OrientationAxis } from '../../../enums';
import type { IImageVolume, Point3 } from '../../../types';
import type { PlanarCamera } from './PlanarViewportV2Types';

type PlanarCameraVectors = {
  viewPlaneNormal: Point3;
  viewUp: Point3;
};

export function getAcquisitionCameraVectors(
  imageVolume: IImageVolume
): PlanarCameraVectors {
  const { direction } = imageVolume;

  return {
    viewPlaneNormal: direction.slice(6, 9).map((x) => -x) as Point3,
    viewUp: direction.slice(3, 6).map((x) => -x) as Point3,
  };
}

export function getPlanarCameraVectors(args: {
  imageVolume: IImageVolume;
  orientation?: PlanarCamera['orientation'];
}): PlanarCameraVectors | undefined {
  const { imageVolume, orientation } = args;

  if (!orientation) {
    return;
  }

  if (orientation === OrientationAxis.ACQUISITION) {
    return getAcquisitionCameraVectors(imageVolume);
  }

  const cameraValues = MPR_CAMERA_VALUES[orientation];

  if (!cameraValues) {
    return;
  }

  return {
    viewPlaneNormal: [...cameraValues.viewPlaneNormal] as Point3,
    viewUp: [...cameraValues.viewUp] as Point3,
  };
}
