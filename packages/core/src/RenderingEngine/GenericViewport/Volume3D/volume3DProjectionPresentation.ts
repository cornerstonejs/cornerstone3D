import { cloneVolume3DCamera } from './volume3DProjectionCamera';
import type {
  Volume3DProjectionPresentation,
  Volume3DProjectionSnapshot,
} from './Volume3DProjectionTypes';
import type { Volume3DCamera } from './viewport3DTypes';

function isWrappedVolume3DPresentation(
  presentation: Partial<Volume3DProjectionPresentation>
): presentation is Partial<Volume3DProjectionPresentation> & {
  camera: Partial<Volume3DCamera>;
} {
  return Object.prototype.hasOwnProperty.call(presentation, 'camera');
}

function getCameraPatch(
  presentation: Partial<Volume3DProjectionPresentation>
): Partial<Volume3DCamera> {
  if (isWrappedVolume3DPresentation(presentation)) {
    return presentation.camera ?? {};
  }

  return presentation as unknown as Partial<Volume3DCamera>;
}

/**
 * Converts a Volume3D projection snapshot to the existing wrapped camera
 * presentation shape used by 3D tools.
 */
export function getVolume3DProjectionPresentation(
  snapshot: Volume3DProjectionSnapshot
): Volume3DProjectionPresentation {
  return {
    ...snapshot.presentation,
    camera: cloneVolume3DCamera(snapshot.presentation.camera),
  };
}

/**
 * Applies wrapped or raw 3D camera presentation patches to the snapshot camera.
 */
export function withVolume3DProjectionPresentation(
  snapshot: Volume3DProjectionSnapshot,
  presentation: Partial<Volume3DProjectionPresentation>
): Volume3DCamera {
  return cloneVolume3DCamera({
    ...snapshot.presentation.camera,
    ...getCameraPatch(presentation),
  } as Volume3DCamera);
}
