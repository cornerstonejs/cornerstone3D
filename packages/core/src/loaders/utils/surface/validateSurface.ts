import type { PublicSurfaceData } from '../../../types';

export function validateSurface(surfaceData: PublicSurfaceData): void {
  if (!surfaceData.id) {
    throw new Error('Surface must have an id');
  }

  if (surfaceData.points?.length === 0) {
    throw new Error('Surface must have non-empty points array');
  }

  if (surfaceData.polys?.length === 0) {
    throw new Error('Surface must have non-empty polys array');
  }

  if (!surfaceData.frameOfReferenceUID) {
    throw new Error('Surface must have a frameOfReferenceUID');
  }
}
