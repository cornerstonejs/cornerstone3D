import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';

import {
  getCanvasEllipseCorners,
  pointInEllipse,
} from '../../../utilities/math/ellipse';
import { getBoundingBoxAroundShape } from '../../../utilities/boundingBox';
import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import { pointInShapeCallback } from '../../../utilities';

const { transformWorldToIndex } = csUtils;

type OperationData = {
  segmentationId: string;
  imageVolume: Types.IImageVolume;
  points: Types.Point3[];
  lazyCalculation?: boolean;
  volume: Types.IImageVolume;
  segmentIndex: number;
  segmentsLocked: number[];
  viewPlaneNormal: number[];
  viewUp: number[];
  strategySpecificConfiguration: any;
  constraintFn: () => boolean;
};

function calculateEllipseAndBounds(points, viewport, imageData, dimensions) {
  const center = vec3.fromValues(0, 0, 0);
  points.forEach((point) => vec3.add(center, center, point));
  vec3.scale(center, center, 1 / points.length);

  const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));
  const [topLeftCanvas, bottomRightCanvas] =
    getCanvasEllipseCorners(canvasCoordinates);

  const topLeftWorld = viewport.canvasToWorld(topLeftCanvas);
  const bottomRightWorld = viewport.canvasToWorld(bottomRightCanvas);

  const ellipsoidCornersIJK = [
    <Types.Point3>transformWorldToIndex(imageData, topLeftWorld),
    <Types.Point3>transformWorldToIndex(imageData, bottomRightWorld),
  ];

  const boundsIJK = getBoundingBoxAroundShape(ellipsoidCornersIJK, dimensions);

  const ellipseObj = {
    center: center as Types.Point3,
    xRadius: Math.abs(topLeftWorld[0] - bottomRightWorld[0]) / 2,
    yRadius: Math.abs(topLeftWorld[1] - bottomRightWorld[1]) / 2,
    zRadius: Math.abs(topLeftWorld[2] - bottomRightWorld[2]) / 2,
  };

  return { ellipseObj, boundsIJK };
}

function fillCircle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  threshold = false
): void {
  const {
    volume: segmentationVolume,
    imageVolume,
    points,
    segmentsLocked,
    segmentIndex,
    segmentationId,
    strategySpecificConfiguration,
    lazyCalculation,
  } = operationData;

  if (points.length % 4 !== 0) {
    throw new Error('The length of the points array must be a multiple of 4.');
  }

  const { imageData, dimensions } = segmentationVolume;
  const scalarData = segmentationVolume.getScalarData();
  const { viewport } = enabledElement;

  const modifiedSlicesToUse = new Set() as Set<number>;
  const indicesToFill = new Set() as Set<number>;

  function callback({ value, index, pointIJK }) {
    if (segmentsLocked.includes(value)) {
      return;
    }
    if (
      !threshold ||
      isWithinThreshold(index, imageVolume, strategySpecificConfiguration)
    ) {
      indicesToFill.add(index);
      modifiedSlicesToUse.add(pointIJK[2]);
    }
  }

  // Previously fillSphere and fillCircle (used in brushes) were acting on a
  // single circle or sphere. However, that meant that we were modifying the
  // segmentation scalar data on each drag (can be often +100 transactions). Lazy
  // calculation allows us to only modify the segmentation scalar data once the
  // user has finished drawing the circle or sphere. This is done by splitting
  // the points into chunks and only triggering the segmentation data modified
  // event once all the points have been processed. The tool need to provide the points
  // in the correct order to be chunked here. Todo: Maybe we should move the chunk
  // logic to the tool itself.
  let pointsChunks;
  if (lazyCalculation) {
    pointsChunks = [];
    for (let i = 0; i < points.length; i += 4) {
      pointsChunks.push(points.slice(i, i + 4));
    }
  } else {
    pointsChunks = [points];
  }

  for (let i = 0; i < pointsChunks.length; i++) {
    const pointsChunk = pointsChunks[i];
    const { ellipseObj, boundsIJK } = calculateEllipseAndBounds(
      pointsChunk,
      viewport,
      imageData,
      dimensions
    );
    pointInShapeCallback(
      imageData,
      (pointLPS, pointIJK) => pointInEllipse(ellipseObj, pointLPS),
      callback,
      boundsIJK
    );
  }

  indicesToFill.forEach((index) => {
    scalarData[index] = segmentIndex;
  });

  const arrayOfSlices: number[] = Array.from(modifiedSlicesToUse);

  triggerSegmentationDataModified(segmentationId, arrayOfSlices);
}

function isWithinThreshold(
  index: number,
  imageVolume: Types.IImageVolume,
  strategySpecificConfiguration: any
) {
  const { THRESHOLD_INSIDE_CIRCLE } = strategySpecificConfiguration;

  const voxelValue = imageVolume.getScalarData()[index];
  const { threshold } = THRESHOLD_INSIDE_CIRCLE;

  return threshold[0] <= voxelValue && voxelValue <= threshold[1];
}

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function fillInsideCircle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  fillCircle(enabledElement, operationData, false);
}

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
  const { volume, imageVolume } = operationData;

  if (
    !csUtils.isEqual(volume.dimensions, imageVolume.dimensions) ||
    !csUtils.isEqual(volume.direction, imageVolume.direction)
  ) {
    throw new Error(
      'Only source data the same dimensions/size/orientation as the segmentation currently supported.'
    );
  }

  fillCircle(enabledElement, operationData, true);
}

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
