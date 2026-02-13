import type { Types } from '@cornerstonejs/core';
import { ORIENTATION_TOLERANCE } from './constants';

/**
 * Maps a camera normal vector to an orientation string.
 * Returns 'AXIAL', 'CORONAL', 'SAGITTAL', or null if not matched.
 *
 * @param normal - The view plane normal vector
 * @returns The orientation string or null if not matched
 */
export function getOrientationFromNormal(
  normal: Types.Point3
): 'AXIAL' | 'CORONAL' | 'SAGITTAL' | null {
  if (!normal) {
    return null;
  }

  // Canonical normals for each orientation
  const canonical = {
    AXIAL: [0, 0, 1],
    CORONAL: [0, 1, 0],
    SAGITTAL: [1, 0, 0],
  };

  // Use a tolerance for floating point comparison
  const tol = ORIENTATION_TOLERANCE;

  for (const [key, value] of Object.entries(canonical)) {
    // Check positive direction
    if (
      Math.abs(normal[0] - value[0]) < tol &&
      Math.abs(normal[1] - value[1]) < tol &&
      Math.abs(normal[2] - value[2]) < tol
    ) {
      return key as 'AXIAL' | 'CORONAL' | 'SAGITTAL';
    }

    // Also check negative direction
    if (
      Math.abs(normal[0] + value[0]) < tol &&
      Math.abs(normal[1] + value[1]) < tol &&
      Math.abs(normal[2] + value[2]) < tol
    ) {
      return key as 'AXIAL' | 'CORONAL' | 'SAGITTAL';
    }
  }

  return null;
}
