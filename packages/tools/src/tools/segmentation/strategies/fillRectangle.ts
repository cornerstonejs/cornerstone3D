import { vec3 } from 'gl-matrix';
import { BaseVolumeViewport, utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  getBoundingBoxAroundShapeIJK,
  getBoundingBoxAroundShapeWorld,
} from '../../../utilities/boundingBox';
import BrushStrategy from './BrushStrategy';
import type { Composition, InitializedOperationData } from './BrushStrategy';
import { StrategyCallbacks } from '../../../enums';
import compositions from './compositions';
import { isAxisAlignedRectangle } from '../../../utilities/rectangleROITool/isAxisAlignedRectangle';

const { transformWorldToIndex } = csUtils;

const initializeRectangle = {
  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const {
      points, // bottom, top, left, right
      imageVoxelManager: imageVoxelManager,
      viewport,
      segmentationImageData,
      segmentationVoxelManager: segmentationVoxelManager,
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

    const { boundsIJK, pointInShapeFn } = createPointInRectangle(
      viewport,
      points,
      segmentationImageData
    );
    segmentationVoxelManager.boundsIJK = boundsIJK;
    imageVoxelManager.isInObject = pointInShapeFn;
  },
} as Composition;

/**
 * Creates a function that tells the user if the provided point in LPS space
 * is inside the rectangle.
 *
 */
function createPointInRectangle(viewport, points, segmentationImageData) {
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

  const isVolumeViewport = viewport instanceof BaseVolumeViewport;

  // Are we working with 2D rectangle in axis aligned viewport view or not
  const isAligned =
    !isVolumeViewport || isAxisAlignedRectangle(rectangleCornersIJK);

  const direction = segmentationImageData.getDirection();
  const spacing = segmentationImageData.getSpacing();
  const { viewPlaneNormal } = viewport.getCamera();

  // In case that we are working on oblique, our EPS is really the spacing in the
  // normal direction, since we can't really test each voxel against a 2D rectangle
  // we need some tolerance in the normal direction.
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

  const pointInShapeFn = isAligned
    ? () => true
    : (pointLPS) => {
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
  compositions.labelmapStatistics,
  compositions.labelmapInterpolation
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
  compositions.labelmapStatistics,
  compositions.labelmapInterpolation
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
