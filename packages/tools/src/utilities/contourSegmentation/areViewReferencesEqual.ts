import type { Types } from '@cornerstonejs/core';

/**
 * Checks if two ViewReference objects are equal based on the most important attributes:
 * FrameOfReferenceUID, referencedImageId, and viewPlaneNormal.
 *
 * @param a The first ViewReference
 * @param b The second ViewReference
 * @returns True if the key attributes are equal, false otherwise
 */
export function areViewReferencesEqual(
  a: Types.ViewReference,
  b: Types.ViewReference
): boolean {
  if (!a || !b) {
    return false;
  }

  if (a.FrameOfReferenceUID !== b.FrameOfReferenceUID) {
    return false;
  }

  if (a.referencedImageId !== b.referencedImageId) {
    return false;
  }

  if (!a.viewPlaneNormal || !b.viewPlaneNormal) {
    return false;
  }

  if (a.viewPlaneNormal.length !== b.viewPlaneNormal.length) {
    return false;
  }

  for (let i = 0; i < a.viewPlaneNormal.length; i++) {
    if (a.viewPlaneNormal[i] !== b.viewPlaneNormal[i]) {
      return false;
    }
  }

  return true;
}
