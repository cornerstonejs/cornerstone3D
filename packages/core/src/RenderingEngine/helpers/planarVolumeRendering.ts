import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import type { ICamera, IImageVolume, Point3 } from '../../types';
import getSliceRange from '../../utilities/getSliceRange';
import getSpacingInNormalDirection from '../../utilities/getSpacingInNormalDirection';
import snapFocalPointToSlice from '../../utilities/snapFocalPointToSlice';

export interface PlanarVolumeSliceNavigationState {
  currentSliceIndex: number;
  sliceRange: ReturnType<typeof getSliceRange>;
  spacingInNormalDirection: number;
}

export function getPlanarVolumeSliceNavigationState(args: {
  actor: vtkVolume;
  camera: Pick<ICamera, 'focalPoint' | 'position' | 'viewPlaneNormal'>;
  imageVolume: IImageVolume;
}): PlanarVolumeSliceNavigationState {
  const { actor, camera, imageVolume } = args;
  const { focalPoint, viewPlaneNormal } = camera;
  const sliceRange = getSliceRange(actor, viewPlaneNormal, focalPoint);
  const spacingInNormalDirection = getSpacingInNormalDirection(
    imageVolume,
    viewPlaneNormal
  );
  const steps = Math.round(
    (sliceRange.max - sliceRange.min) / spacingInNormalDirection
  );
  const range = sliceRange.max - sliceRange.min;

  if (steps <= 0 || range === 0) {
    return {
      currentSliceIndex: 0,
      sliceRange,
      spacingInNormalDirection,
    };
  }

  const fraction = (sliceRange.current - sliceRange.min) / range;

  return {
    currentSliceIndex: Math.round(fraction * steps),
    sliceRange,
    spacingInNormalDirection,
  };
}

export function getPlanarVolumeSlicePoint(args: {
  camera: Pick<ICamera, 'focalPoint' | 'position' | 'viewPlaneNormal'>;
  delta: number;
  sliceRange: ReturnType<typeof getSliceRange>;
  spacingInNormalDirection: number;
}): { newFocalPoint: Point3; newPosition: Point3 } {
  const { camera, delta, sliceRange, spacingInNormalDirection } = args;

  return snapFocalPointToSlice(
    camera.focalPoint,
    camera.position,
    sliceRange,
    camera.viewPlaneNormal,
    spacingInNormalDirection,
    delta
  );
}
