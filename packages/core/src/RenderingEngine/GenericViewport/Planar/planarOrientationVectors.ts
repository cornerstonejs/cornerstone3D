import { vec3 } from 'gl-matrix';
import { MPR_CAMERA_VALUES } from '../../../constants';
import { OrientationAxis } from '../../../enums';
import type { IImageVolume, OrientationVectors, Point3 } from '../../../types';
import getAcquisitionPlaneOrientation from '../../../utilities/getAcquisitionPlaneOrientation';
import isEqual, { isEqualAbs } from '../../../utilities/isEqual';
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

/**
 * The orientation vectors that `setOrientation` takes, as the legacy volume
 * viewport takes them. A given view up becomes orthogonal to the normal, which
 * is the view up that the legacy viewport draws with. Without one, the current
 * view up stays when it is orthogonal to the normal, a normal along x or y
 * takes [0, 0, 1], a normal along z takes [0, -1, 0], and any other normal
 * takes the current view up made orthogonal to it. A normal of zero length,
 * or a view up along the normal, is left as it is.
 */
export function resolvePlanarSetOrientationVectors(
  orientation: OrientationVectors,
  currentViewUp?: Point3
): OrientationVectors {
  const viewPlaneNormal = normalizeVector(orientation.viewPlaneNormal);

  if (!viewPlaneNormal) {
    return orientation;
  }

  if (orientation.viewUp) {
    const viewUp = getOrthogonalViewUp(viewPlaneNormal, orientation.viewUp);

    return viewUp ? { viewPlaneNormal, viewUp } : orientation;
  }

  if (!currentViewUp) {
    return { viewPlaneNormal };
  }

  if (
    isEqual(
      vec3.dot(
        currentViewUp as unknown as vec3,
        viewPlaneNormal as unknown as vec3
      ),
      0
    )
  ) {
    return { viewPlaneNormal, viewUp: [...currentViewUp] as Point3 };
  }

  if (isEqualAbs(viewPlaneNormal[0], 1) || isEqualAbs(viewPlaneNormal[1], 1)) {
    return { viewPlaneNormal, viewUp: [0, 0, 1] };
  }

  if (isEqualAbs(viewPlaneNormal[2], 1)) {
    return { viewPlaneNormal, viewUp: [0, -1, 0] };
  }

  const viewUp = getOrthogonalViewUp(viewPlaneNormal, currentViewUp);

  return viewUp ? { viewPlaneNormal, viewUp } : { viewPlaneNormal };
}

/** The vector of unit length along the vector, or undefined for zero. */
function normalizeVector(vector: Point3): Point3 | undefined {
  const length = Math.hypot(vector[0], vector[1], vector[2]);

  if (!(length > 1e-12)) {
    return;
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

/**
 * The view up made orthogonal to a unit normal and of unit length, or
 * undefined when it lies along the normal.
 */
function getOrthogonalViewUp(
  viewPlaneNormal: Point3,
  viewUp: Point3
): Point3 | undefined {
  const dot =
    viewUp[0] * viewPlaneNormal[0] +
    viewUp[1] * viewPlaneNormal[1] +
    viewUp[2] * viewPlaneNormal[2];

  return normalizeVector([
    viewUp[0] - dot * viewPlaneNormal[0],
    viewUp[1] - dot * viewPlaneNormal[1],
    viewUp[2] - dot * viewPlaneNormal[2],
  ]);
}
