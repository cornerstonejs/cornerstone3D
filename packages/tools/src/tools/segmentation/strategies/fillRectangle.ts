import { vec3 } from 'gl-matrix';
import { utilities as csUtils, StackViewport } from '@cornerstonejs/core';
import type { Types, BaseVolumeViewport } from '@cornerstonejs/core';

import type { LabelmapToolOperationData } from '../../../types';
import BrushStrategy from './BrushStrategy';
import type { Composition, InitializedOperationData } from './BrushStrategy';
import { StrategyCallbacks } from '../../../enums';
import compositions from './compositions';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

const { transformWorldToIndex } = csUtils;

type OperationData = LabelmapToolOperationData & {
  points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3];
};

const initializeRectangle = {
  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const {
      points, // bottom, top, left, right
      viewport,
      segmentationImageData,
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

    // 2. Find the extent of the ellipse (circle) in IJK index space of the image

    // const { boundsIJK, pointInShapeFn } = createPointInRectangle(
    //   viewport,
    //   points,
    //   segmentationImageData
    // );
    // segmentationVoxelManager.boundsIJK = boundsIJK;
    // imageVoxelManager.isInObject = pointInShapeFn;

    const { boundsIJK, pointInShapeFn } = createPointInRectangle(
      viewport as BaseVolumeViewport,
      points,
      segmentationImageData
    );

    operationData.isInObject = pointInShapeFn;
    operationData.isInObjectBoundsIJK = boundsIJK;
  },
} as Composition;

function createPointInRectangle(
  viewport: BaseVolumeViewport,
  points: Types.Point3[],
  segmentationImageData: vtkImageData
) {
  /**
   * Ensure stable rectangle ordering.
   * Prevents incorrect axis construction on rotated views.
   */
  function orderPoints(pts: Types.Point3[]) {
    const center = vec3.create();

    pts.forEach((p) => vec3.add(center, center, p));

    vec3.scale(center, center, 1 / pts.length);

    return [...pts].sort((a, b) => {
      const angleA = Math.atan2(a[1] - center[1], a[0] - center[0]);

      const angleB = Math.atan2(b[1] - center[1], b[0] - center[0]);

      return angleA - angleB;
    });
  }

  const orderedPoints = orderPoints(points);

  const [p0, p1, p2, p3] = orderedPoints;

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
