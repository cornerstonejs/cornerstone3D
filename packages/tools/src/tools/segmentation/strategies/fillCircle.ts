import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import { cache, utilities as csUtils } from '@cornerstonejs/core';

import {
  getCanvasEllipseCorners,
  pointInEllipse,
} from '../../../utilities/math/ellipse';
import { getBoundingBoxAroundShape } from '../../../utilities/boundingBox';
import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import { pointInShapeCallback } from '../../../utilities';
import isWithinThreshold from './utils/isWithinThreshold';
import {
  SegToolsEditData,
  SegToolsEditDataStack,
  SegToolsEditDataVolume,
  SegToolsOperationData,
} from '../../../types';

const { transformWorldToIndex } = csUtils;

type OperationData = SegToolsOperationData & {
  points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3];
};

function isStackSegmentation(
  editData: SegToolsEditData
): editData is SegToolsEditDataStack {
  return (editData as SegToolsEditDataStack).imageIds !== undefined;
}

function isVolumeSegmentation(
  editData: SegToolsEditData
): editData is SegToolsEditDataVolume {
  return (editData as SegToolsEditDataVolume).imageVolume !== undefined;
}

function fillCircle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  threshold = false
): void {
  const {
    points,
    segmentsLocked,
    segmentIndex,
    segmentationId,
    strategySpecificConfiguration,
  } = operationData;

  const { viewport } = enabledElement;
  let segmentationImageData, segmentationScalarData, imageScalarData;
  if (isVolumeSegmentation(operationData.editData)) {
    const { segmentation: segmentationVolume, imageVolume } =
      operationData.editData;
    ({ imageData: segmentationImageData } = segmentationVolume);
    segmentationScalarData = segmentationVolume.getScalarData();
    imageScalarData = imageVolume.getScalarData();
  } else {
    const {
      currentImageId,
      segmentationRepresentationUID,
      segmentationImageIds,
    } = operationData.editData;

    if (!currentImageId) {
      return;
    }

    // we know that the segmentationRepresentationUID is the name of the actor always
    // and always circle modifies the current imageId which in fact is the imageData
    // of that actor at that moment so we have the imageData already
    const actor = viewport.getActor(segmentationRepresentationUID);
    segmentationImageData = actor.actor.getMapper().getInputData();
    const colonIndex = currentImageId.indexOf(':');
    const imageURI = currentImageId.substring(colonIndex + 1);
    const currentSegmentationImageId = segmentationImageIds.find((imageId) =>
      imageId.includes(imageURI)
    );

    const segmentationImage = cache.getImage(currentSegmentationImageId);
    segmentationScalarData = segmentationImage.getPixelData();

    const uniqueValues = new Set<number>();
    for (const value of segmentationScalarData) {
      uniqueValues.add(value);
    }

    const image = cache.getImage(currentImageId);

    // VERY IMPORTANT
    // This is the pixel data of the image that is being segmented in the cache
    // and we need to use this to for the modification
    imageScalarData = image.getPixelData();
  }

  const { ellipseObj, boundsIJK } = getEllipse(
    viewport,
    segmentationImageData,
    points
  );

  const modifiedSlicesToUse = new Set() as Set<number>;

  let callback;

  if (threshold) {
    callback = ({ value, index, pointIJK }) => {
      if (segmentsLocked.includes(value)) {
        return;
      }

      if (
        isWithinThreshold(index, imageScalarData, strategySpecificConfiguration)
      ) {
        segmentationScalarData[index] = segmentIndex;
        //Todo: I don't think this will always be index 2 in streamingImageVolume?
        modifiedSlicesToUse.add(pointIJK[2]);
      }
    };
  } else {
    callback = ({ value, index, pointIJK }) => {
      if (segmentsLocked.includes(value)) {
        return;
      }
      segmentationScalarData[index] = segmentIndex;
      modifiedSlicesToUse.add(pointIJK[2]);
    };
  }

  pointInShapeCallback(
    segmentationImageData,
    (pointLPS) => pointInEllipse(ellipseObj, pointLPS),
    callback,
    boundsIJK
  );

  const arrayOfSlices: number[] = Array.from(modifiedSlicesToUse);

  triggerSegmentationDataModified(segmentationId, arrayOfSlices);
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
  if (isVolumeSegmentation(operationData.editData)) {
    const { segmentation, imageVolume } = operationData.editData;

    if (
      !csUtils.isEqual(segmentation.dimensions, imageVolume.dimensions) ||
      !csUtils.isEqual(segmentation.direction, imageVolume.direction)
    ) {
      throw new Error(
        'Only source data the same dimensions/size/orientation as the segmentation currently supported.'
      );
    }
  }

  fillCircle(enabledElement, operationData, true);
}

/**
 * Fill outside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels outside the  defined circle.
j * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function fillOutsideCircle(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  throw new Error('Not yet implemented');
}

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
function getCenter(points) {
  // Average the points to get the center of the ellipse
  const center = vec3.fromValues(0, 0, 0);
  points.forEach((point) => {
    vec3.add(center, center, point);
  });
  vec3.scale(center, center, 1 / points.length);
  return center;
}

function getEllipse(viewport, imageData, points) {
  const center = getCenter(points);
  const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));
  const dimensions = imageData.getDimensions();

  // 1. From the drawn tool: Get the ellipse (circle) topLeft and bottomRight
  // corners in canvas coordinates
  const [topLeftCanvas, bottomRightCanvas] =
    getCanvasEllipseCorners(canvasCoordinates);

  // 2. Find the extent of the ellipse (circle) in IJK index space of the image
  const topLeftWorld = viewport.canvasToWorld(topLeftCanvas);
  const bottomRightWorld = viewport.canvasToWorld(bottomRightCanvas);

  const ellipsoidCornersIJK = [
    <Types.Point3>transformWorldToIndex(imageData, topLeftWorld),
    <Types.Point3>transformWorldToIndex(imageData, bottomRightWorld),
  ];

  const boundsIJK = getBoundingBoxAroundShape(ellipsoidCornersIJK, dimensions);

  if (boundsIJK.every(([min, max]) => min !== max)) {
    throw new Error('Oblique segmentation tools are not supported yet');
  }

  // using circle as a form of ellipse
  const ellipseObj = {
    center: center as Types.Point3,
    xRadius: Math.abs(topLeftWorld[0] - bottomRightWorld[0]) / 2,
    yRadius: Math.abs(topLeftWorld[1] - bottomRightWorld[1]) / 2,
    zRadius: Math.abs(topLeftWorld[2] - bottomRightWorld[2]) / 2,
  };
  return { ellipseObj, boundsIJK };
}
