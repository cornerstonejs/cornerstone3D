import type { Point3 } from '../../../types';
import { OrientationAxis } from '../../../enums';
import { clonePlanarOrientation } from './planarLegacyCompatibility';
import type { PlanarCamera } from './PlanarViewportV2Types';
import { normalizePlanarRotation } from './planarViewPresentation';

export function createDefaultPlanarCamera(): PlanarCamera {
  return {
    imageIdIndex: 0,
    orientation: OrientationAxis.ACQUISITION,
    frame: {
      anchorView: [0.5, 0.5],
      scale: 1,
      scaleMode: 'fit',
      rotation: 0,
    },
  };
}

export function normalizePlanarCamera(camera: PlanarCamera): PlanarCamera {
  return {
    ...(camera.imageIdIndex !== undefined
      ? { imageIdIndex: camera.imageIdIndex }
      : {}),
    orientation:
      clonePlanarOrientation(camera.orientation) ?? OrientationAxis.ACQUISITION,
    frame: {
      anchorView: camera.frame?.anchorView ?? [0.5, 0.5],
      scale: Math.max(camera.frame?.scale ?? 1, 0.001),
      scaleMode: 'fit',
      rotation: normalizePlanarRotation(camera.frame?.rotation ?? 0),
      ...(camera.frame?.anchorPoint
        ? { anchorPoint: [...camera.frame.anchorPoint] as Point3 }
        : {}),
    },
  };
}
