import { PublicSurfaceData } from '../../../types/index.js';

export function validateSurface(contourSetData: PublicSurfaceData) {
  const { data } = contourSetData;

  if (!data.points || !data.polys) {
    throw new Error('Invalid surface data');
  }
}
