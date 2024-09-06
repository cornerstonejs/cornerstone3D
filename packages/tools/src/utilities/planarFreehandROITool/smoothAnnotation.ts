import { Types } from '@cornerstonejs/core';
import { mat4, vec3 } from 'gl-matrix';
import { PlanarFreehandROIAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import interpolateSegmentPoints from './interpolation/interpolateSegmentPoints';

export type SmoothOptions = {
  knotsRatioPercentage: number;
  loop: number;
};

function shouldPreventInterpolation(
  annotation: PlanarFreehandROIAnnotation,
  options?: SmoothOptions
): boolean {
  const knotsRatioPercentage = options?.knotsRatioPercentage || 30;
  if (
    !annotation?.data?.contour?.polyline?.length ||
    knotsRatioPercentage <= 0
  ) {
    return true;
  }

  return false;
}

function rotateMatrix(normal, focal) {
  const mat = mat4.create();
  const eye = vec3.add(vec3.create(), focal, normal);
  const up =
    Math.abs(normal[0]) > 0.1
      ? vec3.fromValues(-normal[1], normal[0], 0)
      : vec3.fromValues(0, -normal[2], normal[1]);
  // Use the focal point as the "eye" position so that the focal point get rotated to 0 for the k coordinate.
  mat4.lookAt(mat, focal, eye, up);
  return mat;
}

/**
 * Rotate the array to prevent interpolation at endpoints causing non-smooth endpoints
 * Rotates the list in place.
 */
function rotate(list, count = Math.floor(Math.random() * (list.length - 1))) {
  if (count === 0) {
    return 0;
  }
  const srcList = [...list];
  const { length } = list;
  for (let i = 0; i < length; i++) {
    list[i] = srcList[(i + count + length) % length];
  }
  return count;
}

/**
 * Interpolates a given annotation from a given enabledElement.
 * It mutates annotation param.
 * The param options.knotsRatioPercentage defines the percentage of points to be considered as knots on the interpolation process.
 * The param options.loop can be set to run smoothing repeatedly.  This results in
 * additional smoothing.
 * This works by translating the annotation into the view plane normal orientation, with a zero k component, and then
 * performing the smoothing in-plane, and converting back to the original orientation.
 * Closed polylines are smoothed at a random starting spot in order to prevent
 * the start/end points from not being smoothed.
 *
 * Note that each smoothing iteration will reduce the size of the annotation, particularly
 * for closed annotations.  This occurs because a smaller/rounder annotation is smoother
 * in some sense than the original.
 */
export default function smoothAnnotation(
  annotation: PlanarFreehandROIAnnotation,
  options?: SmoothOptions
): boolean {
  // prevent running while there is any tool annotation being modified
  if (shouldPreventInterpolation(annotation, options)) {
    return false;
  }

  const { viewPlaneNormal } = annotation.metadata;
  const { closed, polyline } = annotation.data.contour;

  // use only 2 dimensions on interpolation (what visually matters),
  // otherwise a 3d interpolation might have a totally different output as it consider one more dimension.
  const rotateMat = rotateMatrix(
    viewPlaneNormal,
    annotation.data.contour.polyline[0]
  );
  const canvasPoints = <Types.Point2[]>annotation.data.contour.polyline.map(
    (p) => {
      const planeP = vec3.transformMat4(vec3.create(), p, rotateMat);
      return [planeP[0], planeP[1]];
    }
  );
  let rotation = closed ? rotate(canvasPoints) : 0;
  let interpolatedCanvasPoints = <Types.Point2[]>(
    interpolateSegmentPoints(
      canvasPoints,
      0,
      canvasPoints.length,
      options?.knotsRatioPercentage || 30
    )
  );

  if (interpolatedCanvasPoints === canvasPoints) {
    return false;
  }
  // Reverse the rotation so that handles still line up.
  rotate(interpolatedCanvasPoints, -rotation);

  for (let i = 1; i < options?.loop; i++) {
    rotation = closed ? rotate(interpolatedCanvasPoints) : 0;
    interpolatedCanvasPoints = <Types.Point2[]>(
      interpolateSegmentPoints(
        interpolatedCanvasPoints,
        0,
        canvasPoints.length,
        options?.knotsRatioPercentage || 30
      )
    );
    rotate(interpolatedCanvasPoints, -rotation);
  }

  const unRotate = mat4.invert(mat4.create(), rotateMat);
  annotation.data.contour.polyline = <Types.Point3[]>(
    interpolatedCanvasPoints.map((p) =>
      vec3.transformMat4([0, 0, 0], [...p, 0], unRotate)
    )
  );

  return true;
}
