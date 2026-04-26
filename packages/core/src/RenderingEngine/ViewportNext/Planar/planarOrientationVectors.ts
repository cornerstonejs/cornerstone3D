import { MPR_CAMERA_VALUES } from '../../../constants';
import { OrientationAxis } from '../../../enums';
import type { IImageVolume, Point3 } from '../../../types';
import getAcquisitionPlaneOrientation from '../../../utilities/getAcquisitionPlaneOrientation';
import { isPlanarOrientationVectors } from './planarLegacyCompatibility';
import type { PlanarViewState } from './PlanarViewportTypes';

type PlanarViewStateVectors = {
  viewPlaneNormal: Point3;
  viewUp: Point3;
};

export function getAcquisitionCameraVectors(
  imageVolume: IImageVolume
): PlanarViewStateVectors {
  const { viewPlaneNormal, viewUp } =
    getAcquisitionPlaneOrientation(imageVolume);

  return {
    viewPlaneNormal,
    viewUp: viewUp as Point3,
  };
}

export function getPlanarViewStateVectors(args: {
  imageVolume: IImageVolume;
  orientation?: PlanarViewState['orientation'];
}): PlanarViewStateVectors | undefined {
  const { imageVolume, orientation } = args;

  if (!orientation) {
    return;
  }

  if (orientation === OrientationAxis.ACQUISITION) {
    return getAcquisitionCameraVectors(imageVolume);
  }

  if (isPlanarOrientationVectors(orientation)) {
    return {
      viewPlaneNormal: [...orientation.viewPlaneNormal] as Point3,
      viewUp: [
        ...(orientation.viewUp ||
          getAcquisitionCameraVectors(imageVolume).viewUp),
      ] as Point3,
    };
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
