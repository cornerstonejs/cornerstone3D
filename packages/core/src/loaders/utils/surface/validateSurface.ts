import type { PublicSurfaceData } from '../../../types';

export function validateSurface(surfaceData: PublicSurfaceData): void {
  if (!surfaceData.id) {
    throw new Error('Surface must have an id');
  }

  if (
    !surfaceData.points ||
    !Array.isArray(surfaceData.points) ||
    surfaceData.points.length === 0
  ) {
    throw new Error('Surface must have points');
  }

  if (
    !surfaceData.polys ||
    !Array.isArray(surfaceData.polys) ||
    surfaceData.polys.length === 0
  ) {
    throw new Error('Surface must have polys');
  }

  if (!surfaceData.frameOfReferenceUID) {
    throw new Error('Surface must have a frameOfReferenceUID');
  }
}
