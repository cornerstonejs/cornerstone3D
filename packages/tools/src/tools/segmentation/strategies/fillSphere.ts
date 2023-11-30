import type { Types } from '@cornerstonejs/core';
import { cache, utilities as csUtils } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

import {
  getCanvasEllipseCorners,
  pointInEllipse,
} from '../../../utilities/math/ellipse';
import { getBoundingBoxAroundShape } from '../../../utilities/boundingBox';
import BrushStrategy from './BrushStrategy';
import type { OperationData, InitializedOperationData } from './BrushStrategy';
import dynamicWithinThreshold from './utils/dynamicWithinThreshold';
import type { CanvasCoordinates } from '../../../types';
import initializeIslandRemoval from './utils/initializeIslandRemoval';
import initializeTracking from './utils/initializeTracking';
import initializeRegionFill from './utils/initializeRegionFill';
import initializeSetValue from './utils/initializeSetValue';
import initializePreview from './utils/initializePreview';
import initializeThreshold from './utils/initializeThreshold';
import { isVolumeSegmentation } from './utils/stackVolumeCheck';

const { transformWorldToIndex } = csUtils;

const initializeSphere = {
  createInitialized: function intializeSphere(
    enabledElement,
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
    // This will be 2d, now expand to 3d
    const diameters = topLeftWorld.map((left, index) =>
      Math.abs(bottomRightWorld[index] - left)
    );
    const radius = Math.max(...diameters) / 2;
    // Make 3d sphere
    topLeftWorld.forEach((left, index) => {
      const right = bottomRightWorld[index];
      if (left === right) {
        topLeftWorld[index] = left - radius;
        bottomRightWorld[index] = left + radius;
      }
    });

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
    console.log('ellipseObj', ellipseObj);

    imageVoxelValue.isInObject = (pointLPS /*, pointIJK */) =>
      pointInEllipse(ellipseObj, pointLPS);
  },
};

const SPHERE_STRATEGY = new BrushStrategy(
  'Sphere',
  initializeRegionFill,
  initializeSetValue,
  initializeSphere,
  initializeTracking,
  initializePreview
);

/**
 * Fill inside a sphere with the given segment index in the given operation data. The
 * operation data contains the sphere required points.
 * @param enabledElement - The element that is enabled and selected.
 * @param operationData - OperationData
 */
export function fillInsideSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  SPHERE_STRATEGY.fill(enabledElement, operationData);
}

SPHERE_STRATEGY.assignMethods(fillInsideSphere);

const SPHERE_THRESHOLD_STRATEGY = new BrushStrategy(
  'SphereThreshold',
  initializeRegionFill,
  initializeSetValue,
  initializeSphere,
  dynamicWithinThreshold,
  initializeThreshold,
  initializePreview,
  initializeTracking,
  initializeIslandRemoval
);

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being filled.
 * @param operationData - EraseOperationData
 */
export function thresholdInsideSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  if (isVolumeSegmentation(operationData)) {
    const { referencedVolumeId, volumeId } = operationData;

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

  SPHERE_THRESHOLD_STRATEGY.fill(enabledElement, operationData);
}

SPHERE_THRESHOLD_STRATEGY.assignMethods(thresholdInsideSphere);

/**
 * Fill outside a sphere with the given segment index in the given operation data. The
 * operation data contains the sphere required points.
 * @param enabledElement - The element that is enabled and selected.
 * @param operationData - OperationData
 */
export function fillOutsideSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  throw new Error('fill outside sphere not implemented');
}
