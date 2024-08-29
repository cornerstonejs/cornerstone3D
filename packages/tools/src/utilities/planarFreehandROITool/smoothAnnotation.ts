import { Types } from '@cornerstonejs/core';
import { mat4, vec3 } from 'gl-matrix';
import { PlanarFreehandROITool } from '../../tools';
import { ToolGroupManager } from '../../store';
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
 * Interpolates a given annotation from a given enabledElement.
 * It mutates annotation param.
 * The param options.knotsRatioPercentage defines the percentage of points to be considered as knots on the interpolation process.
 * Interpolation will be skipped in case: annotation is not present in enabledElement (or there is no toolGroup associated with it), related tool is being modified.
 * The param options.loop can be set to run smoothing repeatedly.  This results in
 * additional smoothing.
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
  for (let i = 1; i < options?.loop; i++) {
    interpolatedCanvasPoints = <Types.Point2[]>(
      interpolateSegmentPoints(
        interpolatedCanvasPoints,
        0,
        canvasPoints.length,
        options?.knotsRatioPercentage || 30
      )
    );
  }

  const unRotate = mat4.invert(mat4.create(), rotateMat);
  annotation.data.contour.polyline = <Types.Point3[]>(
    interpolatedCanvasPoints.map((p) =>
      vec3.transformMat4([0, 0, 0], [...p, 0], unRotate)
    )
  );

  return true;
}
