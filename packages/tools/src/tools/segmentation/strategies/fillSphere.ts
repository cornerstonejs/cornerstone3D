import type { Types } from '@cornerstonejs/core';
import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import { pointInSurroundingSphereCallback } from '../../../utilities';
import {
  OperationData,
  EditDataStack,
  EditDataVolume,
} from './OperationalData';
import { cache, createVTKImageDataFromImageId } from '@cornerstonejs/core';
import { Vector3 } from '@kitware/vtk.js/types';

export function fillSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  _inside = true
): void {
  const { viewport } = enabledElement;
  const { segmentsLocked, segmentIndex, segmentationId, points } =
    operationData;

  let imageData, callback, dimensions;
  if (operationData.editData.type === 'volume') {
    const { segmentation } = operationData.editData as EditDataVolume;

    imageData = segmentation.imageData;
    dimensions = segmentation.dimensions;
    const scalarData = segmentation.getScalarData();

    callback = ({ index, value }) => {
      if (segmentsLocked.includes(value)) {
        return;
      }
      scalarData[index] = segmentIndex;
      scalarIndex.push(index);
    };
  } else {
    const { imageIds, segmentationImageIds, origin, zSpacing } =
      operationData.editData as EditDataStack;
    imageData = createVTKImageDataFromImageId(segmentationImageIds[0]);
    // hack the imageData so pointInSurroundingSphereCallback can treat it like a volume

    // Hacking the dimensions
    dimensions = imageData.getDimensions();
    dimensions[2] = imageIds.length;
    imageData.setDimensions(dimensions);

    // Hacking the spacing information.
    const spacing = imageData.getSpacing();
    spacing[2] = zSpacing;
    imageData.setSpacing(spacing);
    // Hacking the origin
    imageData.setOrigin(origin as Vector3);

    callback = ({ pointIJK, value }) => {
      if (segmentsLocked.includes(value)) {
        return;
      }
      const slice = pointIJK[2];
      const image = cache.getImage(segmentationImageIds[slice]);
      const scalarData = image.getPixelData();
      const index = pointIJK[1] * dimensions[0] + pointIJK[0];

      scalarData[index] = segmentIndex;
      scalarIndex.push(slice);
    };
  }

  const scalarIndex = [];

  pointInSurroundingSphereCallback(
    imageData,
    [points[0], points[1]],
    callback,
    viewport
  );

  let sliceArray;
  if (operationData.editData.type === 'volume') {
    // Since the scalar indexes start from the top left corner of the cube, the first
    // slice that needs to be rendered can be calculated from the first mask coordinate
    // divided by the zMultiple, as well as the last slice for the last coordinate
    const zMultiple = dimensions[0] * dimensions[1];
    const minSlice = Math.floor(scalarIndex[0] / zMultiple);
    const maxSlice = Math.floor(
      scalarIndex[scalarIndex.length - 1] / zMultiple
    );
    sliceArray = Array.from(
      { length: maxSlice - minSlice + 1 },
      (v, k) => k + minSlice
    );
  } else {
    const minSlice = scalarIndex[0];
    const maxSlice = Math.floor(scalarIndex[scalarIndex.length - 1]);
    sliceArray = Array.from(
      { length: maxSlice - minSlice + 1 },
      (v, k) => k + minSlice
    );
  }
  triggerSegmentationDataModified(segmentationId, sliceArray);
}

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
  fillSphere(enabledElement, operationData, true);
}

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
  fillSphere(enabledElement, operationData, false);
}
