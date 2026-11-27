import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import type { ICamera, IImageVolume, Point3 } from '../../types';
import getSliceRange from '../../utilities/getSliceRange';
import getVolumeSliceGrid, {
  getSliceGridIndex,
  getSliceStep,
} from '../../utilities/getVolumeSliceGrid';
import snapFocalPointToSlice from '../../utilities/snapFocalPointToSlice';

export interface PlanarVolumeSliceNavigationState {
  currentSliceIndex: number;
  /** The index of the last slice of the grid. */
  maxSliceIndex: number;
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
  const spacingInNormalDirection = getSliceStep(imageVolume, viewPlaneNormal);
  const grid = getVolumeSliceGrid(
    sliceRange.min,
    sliceRange.max,
    spacingInNormalDirection
  );

  return {
    currentSliceIndex: getSliceGridIndex(grid, sliceRange.current),
    maxSliceIndex: grid.maxIndex,
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
