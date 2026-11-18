import type { Types } from '@cornerstonejs/core';

/**
 * Rotated the camera of a legacy viewport around a world pivot point. Only a
 * legacy (stack/volume) viewport had the free `setCamera` write that it used,
 * so it rotates nothing and returns false for every viewport. Rotate a next
 * viewport through the view reference API instead, the way
 * SliceIntersectionTool does (`setViewReference` with a rotated
 * viewPlaneNormal/viewUp around the pivot).
 */
export default function rotateViewportAroundWorldPoint(
  _viewport: Types.IViewport | Types.IGenericViewport,
  _pivot: Types.Point3,
  _axis: Types.Point3,
  _angle: number
): boolean {
  return false;
}
