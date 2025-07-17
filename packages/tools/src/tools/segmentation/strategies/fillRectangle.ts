import { vec3 } from 'gl-matrix';
import { utilities as csUtils, StackViewport } from '@cornerstonejs/core';
import type { Types, BaseVolumeViewport } from '@cornerstonejs/core';

import {
  getBoundingBoxAroundShapeIJK,
  getBoundingBoxAroundShapeWorld,
} from '../../../utilities/boundingBox';
import type { LabelmapToolOperationData } from '../../../types';
import { isAxisAlignedRectangle } from '../../../utilities/rectangleROITool/isAxisAlignedRectangle';
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
  [StrategyCallbacks.Initialize]: (
    operationData: InitializedOperationData & {
      points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3];
    }
  ) => {
    const {
      points, // bottom, top, left, right
      imageVoxelManager,
      viewport,
      segmentationImageData,
      segmentationVoxelManager,
    } = operationData;

    // Validate points
    if (!points || points.length !== 4 || points.some((pt) => !pt)) {
      throw new Error(
        'Rectangle initialization requires exactly 4 valid points'
      );
    }
    // Average the points to get the center of the rectangle
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

    // Find the extent of the rectangle in IJK index space of the image
    const { boundsIJK, pointInShapeFn } = createPointInRectangle(
      viewport as BaseVolumeViewport,
      points,
      segmentationImageData
    );

    operationData.isInObject = pointInShapeFn;
    operationData.isInObjectBoundsIJK = boundsIJK as Types.BoundsIJK;
  },
} as Composition;

/**
 * Returns the IJK bounds and a function to test if a point is inside the rectangle.
 * If the rectangle is not axis-aligned, uses a bounding box with EPS tolerance.
 */
function createPointInRectangle(
  viewport: BaseVolumeViewport,
  points: Types.Point3[],
  segmentationImageData: vtkImageData
): {
  boundsIJK: number[][];
  pointInShapeFn: (pointLPS: Types.Point3) => boolean;
} {
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

  const isStackViewport = viewport instanceof StackViewport;

  // Are we working with 2D rectangle in axis aligned viewport view or not
  const isAligned =
    isStackViewport || isAxisAlignedRectangle(rectangleCornersIJK);

  const direction = segmentationImageData.getDirection();
  const spacing = segmentationImageData.getSpacing();
  const { viewPlaneNormal } = viewport.getCamera();

  // For oblique rectangles, use spacing in the normal direction as tolerance (EPS)
  const EPS = csUtils.getSpacingInNormalDirection(
    {
      direction,
      spacing,
    },
    viewPlaneNormal
  );

  const pointsBoundsLPS = getBoundingBoxAroundShapeWorld(points);
  let [[xMin, xMax], [yMin, yMax], [zMin, zMax]] = pointsBoundsLPS;

  // Update the bounds with +/- EPS
  xMin -= EPS;
  xMax += EPS;
  yMin -= EPS;
  yMax += EPS;
  zMin -= EPS;
  zMax += EPS;

  // If axis-aligned, all points in bounds are considered inside
  // Otherwise, use bounding box with EPS tolerance
  const pointInShapeFn = isAligned
    ? () => true
    : (pointLPS: Types.Point3) => {
        const [x, y, z] = pointLPS;
        const xInside = x >= xMin && x <= xMax;
        const yInside = y >= yMin && y <= yMax;
        const zInside = z >= zMin && z <= zMax;
        return xInside && yInside && zInside;
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
