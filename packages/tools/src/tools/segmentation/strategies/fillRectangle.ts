import { vec3 } from 'gl-matrix';
import { utilities as csUtils, StackViewport } from '@cornerstonejs/core';
import type { Types, BaseVolumeViewport } from '@cornerstonejs/core';

import { getBoundingBoxAroundShapeIJK } from '../../../utilities/boundingBox';
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
  let rectangleCornersIJK = points.map((world) => {
    return transformWorldToIndex(segmentationImageData, world);
  });

  // math round
  rectangleCornersIJK = rectangleCornersIJK.map((point) => {
    return point.map((coord) => {
      return Math.round(coord);
    });
  });

  const boundsIJK = getBoundingBoxAroundShapeIJK(
    rectangleCornersIJK,
    segmentationImageData.getDimensions()
  );

  // Rectangle corners in world: [topLeft, topRight, bottomRight, bottomLeft]
  const [p0, p1, p2, p3] = points;
  // Two axes in the plane
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

  // For tolerance in the normal direction
  const direction = segmentationImageData.getDirection();
  const spacing = segmentationImageData.getSpacing();
  const { viewPlaneNormal } = viewport.getCamera();
  const EPS = csUtils.getSpacingInNormalDirection(
    {
      direction,
      spacing,
    },
    viewPlaneNormal
  );

  // Function to check if a point is inside the oblique rectangle
  const pointInShapeFn = (pointLPS) => {
    // Vector from p0 to point
    const v = vec3.create();
    vec3.subtract(v, pointLPS, p0);
    // Project onto axes
    const u = vec3.dot(v, axisU);
    const vproj = vec3.dot(v, axisV);
    // Project onto normal
    const d = Math.abs(vec3.dot(v, normal));
    // Check bounds with tolerance in normal direction
    return (
      u >= -EPS &&
      u <= uLen + EPS &&
      vproj >= -EPS &&
      vproj <= vLen + EPS &&
      d <= EPS
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
