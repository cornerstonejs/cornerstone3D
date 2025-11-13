import { vec3 } from 'gl-matrix';
import type { ReadonlyVec3 } from 'gl-matrix';
import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

import { getBoundingBoxAroundShapeIJK } from '../../../utilities/boundingBox';
import BrushStrategy from './BrushStrategy';
import type { Composition, InitializedOperationData } from './BrushStrategy';
import type { CanvasCoordinates } from '../../../types';
import { StrategyCallbacks } from '../../../enums';
import compositions from './compositions';
import { pointInSphere } from '../../../utilities/math/sphere';

const HALF_SIDE_EPSILON_RATIO = 1e-2;
const MIN_HALF_SIDE_EPSILON = 1e-3;

const { transformWorldToIndex, transformIndexToWorld, isEqual } = csUtils;

/**
 * Returns the corners of an ellipse in canvas coordinates.
 * The corners are returned in the order: topLeft, bottomRight, bottomLeft, topRight.
 *
 * @param canvasCoordinates - The coordinates of the ellipse in the canvas.
 * @returns An array of four points representing the corners of the ellipse.
 */
export function getEllipseCornersFromCanvasCoordinates(
  canvasCoordinates: CanvasCoordinates
): Array<Types.Point2> {
  const [bottom, top, left, right] = canvasCoordinates;
  const topLeft = <Types.Point2>[left[0], top[1]];
  const bottomRight = <Types.Point2>[right[0], bottom[1]];
  const bottomLeft = <Types.Point2>[left[0], bottom[1]];
  const topRight = <Types.Point2>[right[0], top[1]];
  return [topLeft, bottomRight, bottomLeft, topRight];
}

function createSquareCornersForCenter(
  center: Types.Point3,
  viewUp: ReadonlyVec3,
  viewRight: ReadonlyVec3,
  halfSideLength: number
): Types.Point3[] {
  const centerVec = vec3.fromValues(center[0], center[1], center[2]);

  const topOffset = vec3.create();
  vec3.scale(topOffset, viewUp, halfSideLength);

  const bottomOffset = vec3.create();
  vec3.scale(bottomOffset, viewUp, -halfSideLength);

  const rightOffset = vec3.create();
  vec3.scale(rightOffset, viewRight, halfSideLength);

  const leftOffset = vec3.create();
  vec3.scale(leftOffset, viewRight, -halfSideLength);

  const topLeft = vec3.create();
  vec3.add(topLeft, centerVec, topOffset);
  vec3.add(topLeft, topLeft, leftOffset);

  const topRight = vec3.create();
  vec3.add(topRight, centerVec, topOffset);
  vec3.add(topRight, topRight, rightOffset);

  const bottomLeft = vec3.create();
  vec3.add(bottomLeft, centerVec, bottomOffset);
  vec3.add(bottomLeft, bottomLeft, leftOffset);

  const bottomRight = vec3.create();
  vec3.add(bottomRight, centerVec, bottomOffset);
  vec3.add(bottomRight, bottomRight, rightOffset);

  return [
    topLeft as Types.Point3,
    topRight as Types.Point3,
    bottomLeft as Types.Point3,
    bottomRight as Types.Point3,
  ];
}

function densifyStrokeCenters(
  strokeCenters: Types.Point3[],
  halfSideLength: number
): Types.Point3[] {
  if (!strokeCenters.length) {
    return [];
  }

  if (halfSideLength <= 0) {
    return strokeCenters.map((point) => vec3.clone(point) as Types.Point3);
  }

  const expandedCenters: Types.Point3[] = [];

  for (let i = 0; i < strokeCenters.length - 1; i++) {
    const start = strokeCenters[i];
    const end = strokeCenters[i + 1];

    expandedCenters.push(vec3.clone(start) as Types.Point3);

    const distance = vec3.distance(start, end);
    if (distance === 0) {
      continue;
    }

    const steps = Math.max(1, Math.ceil(distance / halfSideLength));
    for (let step = 1; step < steps; step++) {
      const t = step / steps;
      const interpolated = vec3.create();
      vec3.lerp(interpolated, start, end, t);
      expandedCenters.push(interpolated as Types.Point3);
    }
  }

  expandedCenters.push(
    vec3.clone(strokeCenters[strokeCenters.length - 1]) as Types.Point3
  );

  return expandedCenters;
}

// Build a lightweight capsule predicate that covers every sampled point and
// the straight segment in between. The previous approach re-ran the brush
// strategy for many intermediate samples, which was unnecessarily expensive
// and still missed fast mouse moves. This predicate lets us describe the full
// swept volume in constant time per segment when the strategy runs.
function createStrokePredicate(centers: Types.Point3[], radius: number) {
  if (!centers.length || radius <= 0) {
    return null;
  }

  const radiusSquared = radius * radius;
  const centerVecs = centers.map(
    (point) => [point[0], point[1], point[2]] as Types.Point3
  );
  const segments = [] as Array<{
    start: Types.Point3;
    vector: [number, number, number];
    lengthSquared: number;
  }>;

  for (let i = 1; i < centerVecs.length; i++) {
    const start = centerVecs[i - 1];
    const end = centerVecs[i];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dz = end[2] - start[2];
    const lengthSquared = dx * dx + dy * dy + dz * dz;

    segments.push({ start, vector: [dx, dy, dz], lengthSquared });
  }

  return (worldPoint: Types.Point3) => {
    if (!worldPoint) {
      return false;
    }

    for (const centerVec of centerVecs) {
      const dx = worldPoint[0] - centerVec[0];
      const dy = worldPoint[1] - centerVec[1];
      const dz = worldPoint[2] - centerVec[2];
      if (dx * dx + dy * dy + dz * dz <= radiusSquared) {
        return true;
      }
    }

    for (const { start, vector, lengthSquared } of segments) {
      if (lengthSquared === 0) {
        const dx = worldPoint[0] - start[0];
        const dy = worldPoint[1] - start[1];
        const dz = worldPoint[2] - start[2];
        if (dx * dx + dy * dy + dz * dz <= radiusSquared) {
          return true;
        }
        continue;
      }

      const dx = worldPoint[0] - start[0];
      const dy = worldPoint[1] - start[1];
      const dz = worldPoint[2] - start[2];
      const dot = dx * vector[0] + dy * vector[1] + dz * vector[2];
      const t = Math.max(0, Math.min(1, dot / lengthSquared));
      const projX = start[0] + vector[0] * t;
      const projY = start[1] + vector[1] * t;
      const projZ = start[2] + vector[2] * t;
      const distX = worldPoint[0] - projX;
      const distY = worldPoint[1] - projY;
      const distZ = worldPoint[2] - projZ;

      if (distX * distX + distY * distY + distZ * distZ <= radiusSquared) {
        return true;
      }
    }

    return false;
  };
}

const initializeSquare = {
  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const {
      points, // bottom, top, left, right
      viewport,
      segmentationImageData,
      viewUp,
      viewPlaneNormal,
    } = operationData;

    // Happens on a preview setup
    if (!points) {
      return;
    }

    // Calculate the center as the midpoint between the first two points
    // That calculation serves both for orthogonal and oblique planes
    const center = vec3.create();
    if (points.length >= 2) {
      vec3.add(center, points[0], points[1]);
      vec3.scale(center, center, 0.5);
    } else {
      // Fallback to the first point if less than 2 points are provided
      vec3.copy(center, points[0]);
    }

    operationData.centerWorld = center as Types.Point3;
    operationData.centerIJK = transformWorldToIndex(
      segmentationImageData,
      center as Types.Point3
    );

    const halfSideLength =
      points.length >= 2 ? vec3.distance(points[0], points[1]) / 2 : 0;

    const canvasCoordinates = points.map((p) =>
      viewport.worldToCanvas(p)
    ) as CanvasCoordinates;

    const corners = getEllipseCornersFromCanvasCoordinates(canvasCoordinates);
    const cornersInWorld = corners.map((corner) =>
      viewport.canvasToWorld(corner)
    );

    const normalizedViewUp = vec3.fromValues(viewUp[0], viewUp[1], viewUp[2]);
    vec3.normalize(normalizedViewUp, normalizedViewUp);

    const normalizedPlaneNormal = vec3.fromValues(
      viewPlaneNormal[0],
      viewPlaneNormal[1],
      viewPlaneNormal[2]
    );
    vec3.normalize(normalizedPlaneNormal, normalizedPlaneNormal);

    const viewRight = vec3.create();
    vec3.cross(viewRight, normalizedViewUp, normalizedPlaneNormal);
    vec3.normalize(viewRight, viewRight);

    // Build a set of explicit stroke centers. When we only looked at the last
    // sample, quick cursor moves left holes behind. Feeding the full segment
    // gives us deterministic coverage regardless of device speed.
    const strokeCentersSource =
      operationData.strokePointsWorld &&
      operationData.strokePointsWorld.length > 0
        ? operationData.strokePointsWorld
        : [operationData.centerWorld];

    const densifiedStrokeCenters = densifyStrokeCenters(
      strokeCentersSource,
      halfSideLength
    );

    const strokeCornersWorld = densifiedStrokeCenters.flatMap((centerPoint) =>
      createSquareCornersForCenter(
        centerPoint,
        normalizedViewUp,
        viewRight,
        halfSideLength
      )
    );

    const squareCornersIJK = strokeCornersWorld.map((world) =>
      transformWorldToIndex(segmentationImageData, world)
    );

    const boundsIJK = getBoundingBoxAroundShapeIJK(
      squareCornersIJK,
      segmentationImageData.getDimensions()
    );

    operationData.strokePointsWorld = densifiedStrokeCenters;
    operationData.isInObject = createPointInSquare(cornersInWorld, {
      centerWorld: operationData.centerWorld,
      strokePointsWorld: densifiedStrokeCenters,
      segmentationImageData,
      viewUp: normalizedViewUp,
      viewRight,
      normal: normalizedPlaneNormal,
      halfSideLength,
    });

    operationData.isInObjectBoundsIJK = boundsIJK;
  },
} as Composition;

function createPointInSquare(
  cornersInWorld: Types.Point3[] = [],
  options: {
    centerWorld?: Types.Point3;
    strokePointsWorld?: Types.Point3[];
    segmentationImageData?: vtkImageData;
    viewUp: ReadonlyVec3;
    viewRight: ReadonlyVec3;
    normal: ReadonlyVec3;
    halfSideLength: number;
  }
) {
  if (!cornersInWorld || cornersInWorld.length !== 4) {
    throw new Error('createPointInSquare: cornersInWorld must have 4 points');
  }

  const {
    strokePointsWorld = [],
    segmentationImageData,
    viewUp,
    viewRight,
    normal,
    halfSideLength,
    centerWorld,
  } = options;

  const epsilon =
    halfSideLength * HALF_SIDE_EPSILON_RATIO + MIN_HALF_SIDE_EPSILON;

  const centers: Types.Point3[] = [];

  if (strokePointsWorld.length > 0) {
    centers.push(
      ...strokePointsWorld.map((point) => vec3.clone(point) as Types.Point3)
    );
  }

  if (centerWorld) {
    centers.push(vec3.clone(centerWorld) as Types.Point3);
  }

  if (!centers.length) {
    return () => false;
  }

  const projectedCenters = centers.map((point) => ({
    u: vec3.dot(point, viewRight),
    v: vec3.dot(point, viewUp),
  }));

  return (pointLPS: Types.Point3 | null, pointIJK?: Types.Point3) => {
    let worldPoint: Types.Point3 | null = pointLPS;

    if (!worldPoint && pointIJK && segmentationImageData) {
      worldPoint = transformIndexToWorld(
        segmentationImageData,
        pointIJK as Types.Point3
      ) as Types.Point3;
    }

    if (!worldPoint) {
      return false;
    }

    const uPoint = vec3.dot(worldPoint, viewRight);
    const vPoint = vec3.dot(worldPoint, viewUp);

    return projectedCenters.some((center) => {
      const du = uPoint - center.u;
      const dv = vPoint - center.v;

      return Math.max(Math.abs(du), Math.abs(dv)) <= halfSideLength + epsilon;
    });
  };
}

/**
 * Creates a function that tells the user if the provided point in LPS space
 * is inside the ellipse.
 *
 * This will return a sphere test function if the bounds are a circle or
 * sphere shape (same radius in two or three dimensions), or an elliptical shape
 * if they differ.
 */
function createPointInEllipse(
  cornersInWorld: Types.Point3[] = [],
  options: {
    strokePointsWorld?: Types.Point3[];
    segmentationImageData?: vtkImageData;
    radius?: number;
  } = {}
) {
  if (!cornersInWorld || cornersInWorld.length !== 4) {
    throw new Error('createPointInEllipse: cornersInWorld must have 4 points');
  }
  const [topLeft, bottomRight, bottomLeft, topRight] = cornersInWorld;

  // Center is the midpoint of the diagonal
  const center = vec3.create();
  vec3.add(center, topLeft, bottomRight);
  vec3.scale(center, center, 0.5);

  // Major axis: from topLeft to topRight
  const majorAxisVec = vec3.create();
  vec3.subtract(majorAxisVec, topRight, topLeft);
  const xRadius = vec3.length(majorAxisVec) / 2;
  vec3.normalize(majorAxisVec, majorAxisVec);

  // Minor axis: from topLeft to bottomLeft
  const minorAxisVec = vec3.create();
  vec3.subtract(minorAxisVec, bottomLeft, topLeft);
  const yRadius = vec3.length(minorAxisVec) / 2;
  vec3.normalize(minorAxisVec, minorAxisVec);

  // Plane normal
  const normal = vec3.create();
  vec3.cross(normal, majorAxisVec, minorAxisVec);
  vec3.normalize(normal, normal);

  // If radii are equal, treat as sphere
  const radiusForStroke = options.radius ?? Math.max(xRadius, yRadius);
  const strokePredicate = createStrokePredicate(
    options.strokePointsWorld || [],
    radiusForStroke
  );

  if (isEqual(xRadius, yRadius)) {
    const radius = xRadius;
    const sphereObj = {
      center,
      radius,
      radius2: radius * radius,
    };
    return (pointLPS: Types.Point3 | null, pointIJK?: Types.Point3) => {
      let worldPoint: Types.Point3 | null = pointLPS;

      // When the iterator only supplies IJK coordinates we reconstruct the
      // world position once here instead of forcing callers to do the
      // conversion (the previous code re-did this work on every sample).
      if (!worldPoint && pointIJK && options.segmentationImageData) {
        worldPoint = transformIndexToWorld(
          options.segmentationImageData,
          pointIJK as Types.Point3
        ) as Types.Point3;
      }

      if (!worldPoint) {
        return false;
      }

      if (strokePredicate?.(worldPoint)) {
        return true;
      }

      return pointInSphere(sphereObj, worldPoint);
    };
  }

  // Otherwise, treat as ellipse in oblique plane
  return (pointLPS: Types.Point3 | null, pointIJK?: Types.Point3) => {
    let worldPoint: Types.Point3 | null = pointLPS;

    if (!worldPoint && pointIJK && options.segmentationImageData) {
      worldPoint = transformIndexToWorld(
        options.segmentationImageData,
        pointIJK as Types.Point3
      ) as Types.Point3;
    }

    if (!worldPoint) {
      return false;
    }

    if (strokePredicate?.(worldPoint)) {
      return true;
    }

    // Project point onto the plane so we can evaluate the ellipse equation in
    // plane coordinates. We do this once per sample; previously the repeated
    // conversions happened on callers for every interpolated point.
    const pointVec = vec3.create();
    vec3.subtract(pointVec, worldPoint, center);
    // Remove component along normal
    const distToPlane = vec3.dot(pointVec, normal);
    const proj = vec3.create();
    vec3.scaleAndAdd(proj, pointVec, normal, -distToPlane);

    // Express proj in (majorAxis, minorAxis) coordinates
    // Project from center, so shift origin to topLeft
    const fromTopLeft = vec3.create();
    const centerToTopLeft = vec3.create();
    vec3.subtract(centerToTopLeft, center, topLeft);
    vec3.subtract(fromTopLeft, proj, centerToTopLeft);
    const x = vec3.dot(fromTopLeft, majorAxisVec);
    const y = vec3.dot(fromTopLeft, minorAxisVec);

    // Ellipse equation: (x/xRadius)^2 + (y/yRadius)^2 <= 1
    return (x * x) / (xRadius * xRadius) + (y * y) / (yRadius * yRadius) <= 1;
  };
}

const SQUARE_STRATEGY = new BrushStrategy(
  'Square',
  compositions.regionFill,
  compositions.setValue,
  initializeSquare,
  compositions.determineSegmentIndex,
  compositions.preview,
  compositions.labelmapStatistics,
  compositions.squareCursor
);

const SQUARE_THRESHOLD_STRATEGY = new BrushStrategy(
  'SquareThreshold',
  compositions.regionFill,
  compositions.setValue,
  initializeSquare,
  compositions.determineSegmentIndex,
  compositions.dynamicThreshold,
  compositions.threshold,
  compositions.preview,
  compositions.islandRemoval,
  compositions.labelmapStatistics,
  compositions.squareCursor
);

/**
 * Fill inside the square region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined square footprint.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
const fillInsideSquare = SQUARE_STRATEGY.strategyFunction;

/**
 * Fill inside the square region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined square footprint.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
const thresholdInsideSquare = SQUARE_THRESHOLD_STRATEGY.strategyFunction;

/**
 * Fill outside the square region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels outside the defined square footprint.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function fillOutsideCircle(): void {
  throw new Error('Square brush erase not yet implemented');
}

export {
  SQUARE_STRATEGY,
  SQUARE_THRESHOLD_STRATEGY,
  fillInsideSquare,
  thresholdInsideSquare,
  createPointInSquare,
  createPointInEllipse,
  createPointInEllipse as createEllipseInPoint,
};
