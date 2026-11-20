import { EPSILON, MPR_CAMERA_VALUES } from '../../../constants';
import { OrientationAxis } from '../../../enums';
import type { IImageVolume } from '../../../types';
import isEqual from '../../../utilities/isEqual';
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
 * Whether the camera of an orientation name has the view plane normal and
 * the view up of the acquisition camera of a volume.
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

  return (
    isEqual(camera.viewPlaneNormal, acquisition.viewPlaneNormal, EPSILON) &&
    isEqual(camera.viewUp, acquisition.viewUp, EPSILON)
  );
}
