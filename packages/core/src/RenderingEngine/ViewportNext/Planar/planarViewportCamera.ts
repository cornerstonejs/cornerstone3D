import type { Point3 } from '../../../types';
import { OrientationAxis } from '../../../enums';
import type DisplayArea from '../../../types/displayArea';
import { deepClone } from '../../../utilities/deepClone';
import { clonePlanarOrientation } from './planarLegacyCompatibility';
import type { PlanarCamera, PlanarDisplayArea } from './PlanarViewportTypes';
import { normalizePlanarRotation } from './planarViewPresentation';
import {
  clonePlanarScale,
  normalizePlanarScaleMode,
} from './planarCameraScale';

export function cloneDisplayArea<T extends DisplayArea | PlanarDisplayArea>(
  displayArea?: T
): T | undefined {
  return deepClone(displayArea);
}

export function createDefaultPlanarCamera(): PlanarCamera {
  return {
    imageIdIndex: 0,
    orientation: OrientationAxis.ACQUISITION,
    flipHorizontal: false,
    flipVertical: false,
    anchorCanvas: [0.5, 0.5],
    scale: [1, 1],
    scaleMode: 'fit',
    rotation: 0,
  };
}

export function normalizePlanarCamera(camera: PlanarCamera): PlanarCamera {
  const orientationFromCameraVectors = camera.viewPlaneNormal
    ? {
        viewPlaneNormal: [...camera.viewPlaneNormal] as Point3,
        ...(camera.viewUp
          ? {
              viewUp: [...camera.viewUp] as Point3,
            }
          : {}),
      }
    : undefined;

  return {
    ...(camera.imageIdIndex !== undefined
      ? { imageIdIndex: camera.imageIdIndex }
      : {}),
    orientation:
      clonePlanarOrientation(camera.orientation) ??
      orientationFromCameraVectors ??
      OrientationAxis.ACQUISITION,
    flipHorizontal: camera.flipHorizontal === true,
    flipVertical: camera.flipVertical === true,
    anchorCanvas: camera.anchorCanvas ?? [0.5, 0.5],
    scale: clonePlanarScale(camera.scale),
    scaleMode: normalizePlanarScaleMode(
      camera.displayArea?.scaleMode ?? camera.scaleMode
    ),
    rotation: normalizePlanarRotation(camera.rotation ?? 0),
    ...(camera.displayArea
      ? { displayArea: cloneDisplayArea(camera.displayArea) }
      : {}),
    ...(camera.focalPoint
      ? { focalPoint: [...camera.focalPoint] as Point3 }
      : {}),
    ...(camera.position ? { position: [...camera.position] as Point3 } : {}),
    ...(camera.anchorWorld
      ? { anchorWorld: [...camera.anchorWorld] as Point3 }
      : {}),
  };
}
