import type { Types } from '@cornerstonejs/core';
import { BaseVolumeViewport, utilities } from '@cornerstonejs/core';

const { isEqual } = utilities;

const acquisitionMapping = {
  toIJK: (ijkPrime) => ijkPrime,
  fromIJK: (ijk) => ijk,
  type: 'acquistion',
};

const jkMapping = {
  toIJK: ([j, k, i]) => [i, j, k],
  fromIJK: ([i, j, k]) => [j, k, i],
  type: 'jk',
};

const ikMapping = {
  toIJK: ([i, k, j]) => [i, j, k],
  fromIJK: ([i, j, k]) => [i, k, j],
  type: 'ik',
};

/**
 * This function returns a set of functions that normalize the viewport plane
 * into  `i', j', k'` from the image space `i,j,k` such that
 * `i', j'` are within viewport indices corresponding to 1 pixel distance on
 * the underlying view space.
 * As well, the function returns a dimension for the total view space that
 * corresponds to a `[0,dimension)` index for the given bounds.
 */
export default function normalizeViewportPlane(
  viewport: Types.IViewport,
  boundsIJK: Types.BoundsIJK
) {
  if (!(viewport instanceof BaseVolumeViewport)) {
    // This is the case for acquisition plane, which includes all non-volume viewports:
    return { ...acquisitionMapping, boundsIJKPrime: boundsIJK };
  }

  const { viewPlaneNormal } = viewport.getCamera();
  // This doesn't really handle non-coplanar views, but it sort of works even for those, so leave it for now.
  const mapping =
    (isEqual(Math.abs(viewPlaneNormal[0]), 1) && jkMapping) ||
    (isEqual(Math.abs(viewPlaneNormal[1]), 1) && ikMapping) ||
    (isEqual(Math.abs(viewPlaneNormal[2]), 1) && acquisitionMapping);
  if (!mapping) {
    // Non-orthogonal to acquisition plane isn't handled, but doesn't prevent
    // options from working, so return an error indicator.
    return {
      toIJK: null,
      boundsIJKPrime: null,
      fromIJK: null,
      error: `Only mappings orthogonal to acquisition plane are permitted, but requested ${viewPlaneNormal}`,
    };
  }

  return { ...mapping, boundsIJKPrime: mapping.fromIJK(boundsIJK) };
}
