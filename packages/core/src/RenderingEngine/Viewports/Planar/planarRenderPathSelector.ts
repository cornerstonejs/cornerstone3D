import { vec3 } from 'gl-matrix';
import { EPSILON, MPR_CAMERA_VALUES } from '../../../constants';
import { OrientationAxis } from '../../../enums';
import type { IImageVolume, Point3 } from '../../../types';
import isEqual from '../../../utilities/isEqual';
import { isAcquisitionPlaneNormal } from '../../../utilities/isAcquisitionPlaneNormal';
import type { PlanarViewState, PlanarOrientation } from './PlanarViewportTypes';
import { clonePlanarOrientation } from './planarOrientationAndScaling';
import { getAcquisitionCameraVectors } from './planarOrientationVectors';

export {
  PlanarRenderPathDecisionService,
  defaultPlanarRenderPathDecisionService,
  getPlanarAcquisitionOrientation,
  selectPlanarRenderPath,
} from './PlanarRenderPathDecisionService';
export type {
  PlanarRenderPathDecisionOptions,
  SelectedPlanarRenderPath,
} from './PlanarRenderPathDecisionService';

/**
 * The orientation that the view state of a new mount keeps. No orientation
 * is the acquisition. The name of the axis of the acquisition becomes
 * ACQUISITION when both show the same view: for a stack, which shows its
 * images in their own plane (no `imageVolume`), and for a volume whose
 * acquisition camera is the camera of the name. For a volume whose images
 * face another way the name stays, as the legacy volume viewport showed the
 * camera of the name whichever way the images faced.
 */
export function normalizePlanarOrientation(
  orientation: PlanarOrientation | undefined,
  acquisitionOrientation?: PlanarViewState['orientation'],
  imageVolume?: IImageVolume
): PlanarViewState['orientation'] {
  if (!orientation || orientation === OrientationAxis.ACQUISITION) {
    return OrientationAxis.ACQUISITION;
  }

  if (
    acquisitionOrientation &&
    orientation === acquisitionOrientation &&
    (!imageVolume || isAcquisitionCamera(orientation, imageVolume))
  ) {
    return OrientationAxis.ACQUISITION;
  }

  return clonePlanarOrientation(orientation);
}

/**
 * Whether the camera of an orientation name shows the view of the
 * acquisition camera of a volume: its view plane normal is in the
 * acquisition plane by `isAcquisitionPlaneNormal` (a tilt that moves the
 * plane by less than half a slice across the volume) and on the same side,
 * and its view up, laid into the acquisition plane, is the view up of the
 * acquisition camera. A series whose images are turned in their plane or
 * face another way keeps the camera of the name.
 */
function isAcquisitionCamera(
  orientation: PlanarOrientation,
  imageVolume: IImageVolume
): boolean {
  const camera = MPR_CAMERA_VALUES[orientation as string];

  if (!camera) {
    return false;
  }

  const acquisition = getAcquisitionCameraVectors(imageVolume);
  const normal = acquisition.viewPlaneNormal;

  if (
    !isAcquisitionPlaneNormal(imageVolume, camera.viewPlaneNormal) ||
    !(vec3.dot(camera.viewPlaneNormal, normal as unknown as vec3) > 0)
  ) {
    return false;
  }

  const viewUpInPlane = vec3.scaleAndAdd(
    vec3.create(),
    camera.viewUp,
    normal as unknown as vec3,
    -vec3.dot(camera.viewUp, normal as unknown as vec3)
  );

  return isEqual(
    vec3.normalize(viewUpInPlane, viewUpInPlane) as unknown as Point3,
    acquisition.viewUp,
    EPSILON
  );
}
