import { vec3 } from 'gl-matrix';

/**
 * Compute the IJK index of the volume center for use as a camera focal point.
 *
 * Mirrors 3D Slicer's behavior in vtkMRMLSliceLogic::FitSliceToVolumes +
 * SnapSliceOffsetToIJK: center the focal point on the volume's geometric
 * center, then snap *only* the slice-direction axis to the nearest integer
 * voxel center so the camera doesn't land between two slices. The in-plane
 * axes use the continuous geometric center `(d - 1) / 2`.
 *
 * The snap only fires when `viewPlaneNormal` is aligned with an IJK axis
 * (axis-aligned MPR of an axis-aligned acquisition). For oblique acquisitions
 * the IJK axes are tilted relative to the requested MPR plane, so projecting
 * onto a single IJK axis is an approximation -- snapping there shifts the
 * focal point by ~0.5 voxel in world space and can flip the displayed slice
 * index. In that case we fall back to the continuous geometric center on all
 * axes, matching the pre-snap behavior.
 */
export function getVolumeCenterIJK(
  dimensions: number[],
  direction: ArrayLike<number>,
  viewPlaneNormal: ArrayLike<number>
): number[] {
  const ijkAxes: vec3[] = [
    [direction[0], direction[1], direction[2]] as vec3,
    [direction[3], direction[4], direction[5]] as vec3,
    [direction[6], direction[7], direction[8]] as vec3,
  ];
  const normal = [
    viewPlaneNormal[0],
    viewPlaneNormal[1],
    viewPlaneNormal[2],
  ] as vec3;

  let sliceAxis = 0;
  let maxDot = -1;
  for (let i = 0; i < 3; i++) {
    const dot = Math.abs(vec3.dot(ijkAxes[i], normal));
    if (dot > maxDot) {
      maxDot = dot;
      sliceAxis = i;
    }
  }

  // Only snap when the slice axis is exactly aligned with viewPlaneNormal.
  // EPSILON matches the orthonormal tolerance used elsewhere (1e-3).
  const isAxisAligned = Math.abs(maxDot - 1) < 1e-3;

  return dimensions.map((d, i) =>
    i === sliceAxis && isAxisAligned ? Math.floor(d / 2) : (d - 1) / 2
  );
}
