import { vec3 } from 'gl-matrix';
import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import BrushStrategy from './BrushStrategy';
import type { Composition, InitializedOperationData } from './BrushStrategy';
import { StrategyCallbacks } from '../../../enums';
import compositions from './compositions';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { createRectangleObliqueIntegerFill } from './utils/obliqueIntegerFill';

const { transformWorldToIndex } = csUtils;

/**
 * Orders the (coplanar) rectangle corners into a consistent winding order so
 * the in-plane axes can be reconstructed reliably on any view orientation.
 *
 * An in-plane 2D basis (e1, e2) is derived from the corners themselves: e1 is
 * the longest centroid-to-corner vector, the plane normal is the largest cross
 * product of e1 with the other radials, and e2 = normal × e1. The corners are
 * then sorted by their polar angle in that basis, which yields a
 * non-self-intersecting winding regardless of how the plane is oriented in
 * world space. The winding direction (CW vs CCW) is not canonicalized; callers
 * must treat the two in-plane axes symmetrically.
 */
export function orderRectangleCorners(pts: Types.Point3[]): Types.Point3[] {
  if (pts.length < 3) {
    return [...pts];
  }

  const center = vec3.create();
  pts.forEach((p) => vec3.add(center, center, p));
  vec3.scale(center, center, 1 / pts.length);

  // Vectors from the centroid to each corner.
  const radials = pts.map((p) => vec3.subtract(vec3.create(), p, center));

  // First in-plane axis: the longest radial. For a real rectangle this is
  // always non-degenerate, and it lives in the plane by construction.
  let axisInPlane = radials[0];
  let maxLenSq = vec3.squaredLength(axisInPlane);
  for (const radial of radials) {
    const lenSq = vec3.squaredLength(radial);
    if (lenSq > maxLenSq) {
      maxLenSq = lenSq;
      axisInPlane = radial;
    }
  }
  const e1 = vec3.normalize(vec3.create(), axisInPlane);

  // Plane normal: the cross product of e1 with the most independent radial
  // (the one yielding the largest cross product magnitude).
  const normal = vec3.create();
  const candidate = vec3.create();
  for (const radial of radials) {
    vec3.cross(candidate, e1, radial);
    if (vec3.squaredLength(candidate) > vec3.squaredLength(normal)) {
      vec3.copy(normal, candidate);
    }
  }
  vec3.normalize(normal, normal);

  // Second in-plane axis, orthogonal to e1 within the plane.
  const e2 = vec3.normalize(
    vec3.create(),
    vec3.cross(vec3.create(), normal, e1)
  );

  return [...pts].sort((a, b) => {
    const ra = vec3.subtract(vec3.create(), a, center);
    const rb = vec3.subtract(vec3.create(), b, center);
    const angleA = Math.atan2(vec3.dot(ra, e2), vec3.dot(ra, e1));
    const angleB = Math.atan2(vec3.dot(rb, e2), vec3.dot(rb, e1));
    return angleA - angleB;
  });
}

const initializeRectangle = {
  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const {
      points, // bottom, top, left, right
      segmentationImageData,
      viewUp,
      viewPlaneNormal,
    } = operationData;

    // Happens on a preview setup
    if (!points) {
      return;
    }
    // Average the points to get the center of the ellipse
    const center = vec3.fromValues(0, 0, 0);
    points.forEach((point) => {
      vec3.add(center, center, point);
    });
    vec3.scale(center, center, 1 / points.length);

    operationData.centerWorld = center as Types.Point3;
    operationData.centerIJK = transformWorldToIndex(
      segmentationImageData,
      center as Types.Point3
    );

    const orderedPoints = orderRectangleCorners(points);

    // Find the extent of the rectangle in IJK index space of the image.
    const { boundsIJK, pointInShapeFn } = createPointInRectangle(
      orderedPoints,
      segmentationImageData
    );

    operationData.isInObject = pointInShapeFn;
    operationData.isInObjectBoundsIJK = boundsIJK;

    operationData.obliqueIntegerFill = createRectangleObliqueIntegerFill({
      viewUp: viewUp as Types.Point3,
      viewPlaneNormal: viewPlaneNormal as Types.Point3,
      centerIJK: operationData.centerIJK,
      segmentationImageData,
      cornersWorld: orderedPoints,
    });
  },
} as Composition;

function createPointInRectangle(
  orderedPoints: Types.Point3[],
  segmentationImageData: vtkImageData
) {
  const [p0, p1, , p3] = orderedPoints;

  // Convert rectangle corners to IJK.
  const rectangleCornersIJK = orderedPoints.map((world) =>
    transformWorldToIndex(segmentationImageData, world)
  );

  // Bounding box in IJK space.
  const dims = segmentationImageData.getDimensions();

  const cornerIValues = rectangleCornersIJK.map((p) => p[0]);
  const cornerJValues = rectangleCornersIJK.map((p) => p[1]);
  const cornerKValues = rectangleCornersIJK.map((p) => p[2]);

  const boundsIJK = [
    [
      Math.max(0, Math.floor(Math.min(...cornerIValues))),
      Math.min(dims[0] - 1, Math.ceil(Math.max(...cornerIValues))),
    ],
    [
      Math.max(0, Math.floor(Math.min(...cornerJValues))),
      Math.min(dims[1] - 1, Math.ceil(Math.max(...cornerJValues))),
    ],
    [
      Math.max(0, Math.floor(Math.min(...cornerKValues))),
      Math.min(dims[2] - 1, Math.ceil(Math.max(...cornerKValues))),
    ],
  ] as Types.BoundsIJK;

  const axisU = vec3.create();
  const axisV = vec3.create();

  vec3.subtract(axisU, p1, p0); // p0 -> p1
  vec3.subtract(axisV, p3, p0); // p0 -> p3

  const uLen = vec3.length(axisU);
  const vLen = vec3.length(axisV);

  vec3.normalize(axisU, axisU);
  vec3.normalize(axisV, axisV);

  // Plane normal
  const normal = vec3.create();
  vec3.cross(normal, axisU, axisV);
  vec3.normalize(normal, normal);

  const spacing = segmentationImageData.getSpacing();

  const direction = segmentationImageData.getDirection();

  // Proper spacing along rectangle normal.
  // Important for oblique orientations.
  const projectedSpacing = csUtils.getSpacingInNormalDirection(
    {
      direction,
      spacing,
    },
    normal as Types.Point3
  );

  // Use a slightly thicker slab to avoid sparse voxel sampling
  // artifacts on oblique planes.
  // Using full projected spacing gives more stable voxel occupancy.
  const thickness = projectedSpacing;

  // Small tolerance helps stable edge coverage
  // without excessive overfill
  const inPlaneSpacing = Math.min(spacing[0], spacing[1]);

  const inPlaneTolerance = inPlaneSpacing / 2;

  const pointInShapeFn = (pointLPS) => {
    // Vector from p0 to point
    const v = vec3.create();
    vec3.subtract(v, pointLPS, p0);
    // Project onto axes
    const u = vec3.dot(v, axisU);
    const vproj = vec3.dot(v, axisV);
    // Project onto normal
    const distanceToPlane = Math.abs(vec3.dot(v, normal));

    // Check:
    // 1. Inside rectangle bounds (with tolerance)
    // 2. Close enough to plane (slice constraint)
    return (
      u >= -inPlaneTolerance &&
      u <= uLen + inPlaneTolerance &&
      vproj >= -inPlaneTolerance &&
      vproj <= vLen + inPlaneTolerance &&
      distanceToPlane <= thickness
    );
  };

  return { boundsIJK, pointInShapeFn };
}

const RECTANGLE_STRATEGY = new BrushStrategy(
  'Rectangle',
  compositions.regionFill,
  compositions.setValue,
  initializeRectangle,
  compositions.determineSegmentIndex,
  compositions.preview,
  compositions.labelmapStatistics
);

const RECTANGLE_THRESHOLD_STRATEGY = new BrushStrategy(
  'RectangleThreshold',
  compositions.regionFill,
  compositions.setValue,
  initializeRectangle,
  compositions.determineSegmentIndex,
  compositions.dynamicThreshold,
  compositions.threshold,
  compositions.preview,
  compositions.islandRemoval,
  compositions.labelmapStatistics
);

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
const fillInsideRectangle = RECTANGLE_STRATEGY.strategyFunction;

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
const thresholdInsideRectangle = RECTANGLE_THRESHOLD_STRATEGY.strategyFunction;

export {
  RECTANGLE_STRATEGY,
  RECTANGLE_THRESHOLD_STRATEGY,
  fillInsideRectangle,
  thresholdInsideRectangle,
};
