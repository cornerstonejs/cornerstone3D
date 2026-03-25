import type { Point3 } from '../../../types';
import { OrientationAxis } from '../../../enums';
import { clonePlanarOrientation } from './planarLegacyCompatibility';
import type { PlanarCamera } from './PlanarViewportTypes';
import { normalizePlanarRotation } from './planarViewPresentation';

export function createDefaultPlanarCamera(): PlanarCamera {
  return {
    imageIdIndex: 0,
    orientation: OrientationAxis.ACQUISITION,
    flipHorizontal: false,
    flipVertical: false,
    anchorCanvas: [0.5, 0.5],
    scale: 1,
    scaleMode: 'fit',
    rotation: 0,
  };
}

export function normalizePlanarCamera(camera: PlanarCamera): PlanarCamera {
  return {
    ...(camera.imageIdIndex !== undefined
      ? { imageIdIndex: camera.imageIdIndex }
      : {}),
    orientation:
      clonePlanarOrientation(camera.orientation) ?? OrientationAxis.ACQUISITION,
    flipHorizontal: camera.flipHorizontal === true,
    flipVertical: camera.flipVertical === true,
    anchorCanvas: camera.anchorCanvas ?? [0.5, 0.5],
    scale: Math.max(camera.scale ?? 1, 0.001),
    scaleMode: 'fit',
    rotation: normalizePlanarRotation(camera.rotation ?? 0),
    ...(camera.anchorWorld
      ? { anchorWorld: [...camera.anchorWorld] as Point3 }
      : {}),
  };
}
