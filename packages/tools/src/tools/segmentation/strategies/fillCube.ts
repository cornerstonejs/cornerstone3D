import type { ImageVolume, Types } from '@cornerstonejs/core';

import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import { pointInShapeCallback } from '../../../utilities';

type OperationData = {
  points: [Types.Point3, Types.Point3, Types.Point3, Types.Point3];
  volume: ImageVolume;
  imageVolume: Types.IImageVolume;
  segmentIndex: number;
  segmentationId: string;
  segmentsLocked: number[];
  viewPlaneNormal: Types.Point3;
  viewUp: Types.Point3;
  strategySpecificConfiguration: any;
  constraintFn: () => boolean;
};

function fillCube(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  _inside = true
): void {
  const {
    imageVolume,
    volume: segmentation,
    segmentsLocked,
    segmentIndex,
    segmentationId,
    strategySpecificConfiguration,
  } = operationData;

  const { threshold } = strategySpecificConfiguration;

  const scalarData = segmentation.getScalarData();

  const pointInShape = () => true;

  console.log('operationData in fillCube:', operationData);

  const callback = ({ value, index, pointIJK }) => {
    if (segmentsLocked.includes(value)) {
      return;
    }

    const voxelValue = imageVolume.getScalarData()[index];
    // console.log('filling voxel:', pointIJK);
    // console.log('segmentIndex:', segmentIndex);
    // console.log('scalarData[index]:', scalarData[index]);

    if (threshold[0] <= voxelValue && voxelValue <= threshold[1]) {
      scalarData[index] = segmentIndex;
    } else {
      scalarData[index] = 0;
    }
  };

  pointInShapeCallback(imageVolume.imageData, pointInShape, callback);

  triggerSegmentationDataModified(segmentationId);
}

/**
 * Fill inside a sphere with the given segment index in the given operation data. The
 * operation data contains the sphere required points.
 * @param enabledElement - The element that is enabled and selected.
 * @param operationData - OperationData
 */
export function fillInsideCube(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  fillCube(enabledElement, operationData, true);
}

/**
 * Fill outside a sphere with the given segment index in the given operation data. The
 * operation data contains the sphere required points.
 * @param enabledElement - The element that is enabled and selected.
 * @param operationData - OperationData
 */
export function fillOutsideCube(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData
): void {
  fillCube(enabledElement, operationData, false);
}
