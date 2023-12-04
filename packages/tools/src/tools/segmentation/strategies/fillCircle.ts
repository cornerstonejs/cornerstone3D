import { vec3 } from 'gl-matrix';
import { utilities as csUtils, cache } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  getCanvasEllipseCorners,
  pointInEllipse,
} from '../../../utilities/math/ellipse';
import { getBoundingBoxAroundShape } from '../../../utilities/boundingBox';
import BrushStrategy from './BrushStrategy';
import type { OperationData, InitializedOperationData } from './BrushStrategy';
import dynamicWithinThreshold from './utils/dynamicWithinThreshold';
import type {
  CanvasCoordinates,
  LabelmapToolOperationDataVolume,
} from '../../../types';
import initializeIslandRemoval from './utils/initializeIslandRemoval';
import initializeTracking from './utils/initializeTracking';
import initializeRegionFill from './utils/initializeRegionFill';
import initializeSetValue from './utils/initializeSetValue';
import initializePreview from './utils/initializePreview';
import initializeThreshold from './utils/initializeThreshold';
import { isVolumeSegmentation } from './utils/stackVolumeCheck';
import initializeDetermineSegmentIndex from './utils/initializeDetermineSegmentIndex';

const { transformWorldToIndex } = csUtils;

const initializeCircle = {
  createInitialized: function initializeCircle(
    enabled,
    operationData: InitializedOperationData
  ): void {
    const {
      points,
      imageVoxelValue,
      viewport,
      segmentationImageData,
      segmentationVoxelValue,
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
    const canvasCoordinates = points.map((p) =>
      viewport.worldToCanvas(p)
    ) as CanvasCoordinates;

    // 1. From the drawn tool: Get the ellipse (circle) topLeft and bottomRight
    // corners in canvas coordinates
    const [topLeftCanvas, bottomRightCanvas] =
      getCanvasEllipseCorners(canvasCoordinates);

    // 2. Find the extent of the ellipse (circle) in IJK index space of the image
    const topLeftWorld = viewport.canvasToWorld(topLeftCanvas);
    const bottomRightWorld = viewport.canvasToWorld(bottomRightCanvas);

    const ellipsoidCornersIJK = [
      <Types.Point3>transformWorldToIndex(segmentationImageData, topLeftWorld),
      <Types.Point3>(
        transformWorldToIndex(segmentationImageData, bottomRightWorld)
      ),
    ];

    segmentationVoxelValue.boundsIJK = getBoundingBoxAroundShape(
      ellipsoidCornersIJK,
      segmentationVoxelValue.dimensions
    );

    // using circle as a form of ellipse
    const ellipseObj = {
      center: center as Types.Point3,
      xRadius: Math.abs(topLeftWorld[0] - bottomRightWorld[0]) / 2,
      yRadius: Math.abs(topLeftWorld[1] - bottomRightWorld[1]) / 2,
      zRadius: Math.abs(topLeftWorld[2] - bottomRightWorld[2]) / 2,
    };

    imageVoxelValue.isInObject = (pointLPS /*, pointIJK */) =>
      pointInEllipse(ellipseObj, pointLPS);
  },
};

const CIRCLE_STRATEGY = new BrushStrategy(
  'Circle',
  initializeRegionFill,
  initializeSetValue,
  initializeCircle,
  initializeDetermineSegmentIndex,
  initializeTracking,
  initializePreview
);

const CIRCLE_THRESHOLD_STRATEGY = new BrushStrategy(
  'CircleThreshold',
  initializeRegionFill,
  initializeSetValue,
  initializeCircle,
  initializeDetermineSegmentIndex,
  dynamicWithinThreshold,
  initializeThreshold,
  initializeTracking,
  initializePreview,
  initializeIslandRemoval
);

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
const fillInsideCircle = CIRCLE_STRATEGY.assignMethods();

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function thresholdInsideCircle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  if (isVolumeSegmentation(operationData)) {
    const { referencedVolumeId, volumeId } =
      operationData as LabelmapToolOperationDataVolume;

    const imageVolume = cache.getVolume(referencedVolumeId);
    const segmentation = cache.getVolume(volumeId);

    if (
      !csUtils.isEqual(segmentation.dimensions, imageVolume.dimensions) ||
      !csUtils.isEqual(segmentation.direction, imageVolume.direction)
    ) {
      throw new Error(
        'Only source data the same dimensions/size/orientation as the segmentation currently supported.'
      );
    }
  }

  return CIRCLE_THRESHOLD_STRATEGY.fill(enabledElement, operationData);
}

CIRCLE_THRESHOLD_STRATEGY.assignMethods(thresholdInsideCircle);

/**
 * Fill outside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels outside the  defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function fillOutsideCircle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  throw new Error('Not yet implemented');
}

export { CIRCLE_STRATEGY, CIRCLE_THRESHOLD_STRATEGY, fillInsideCircle };
