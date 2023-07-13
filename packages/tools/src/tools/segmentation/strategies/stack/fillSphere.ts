import type { Types } from '@cornerstonejs/core';

import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import { pointInSurroundingSphereCallback } from '../../../../utilities';
import { OperationData, EditDataStack } from '../OperationalData';
import { createVTKImageDataFromImageId } from '../../../../../../core/src/RenderingEngine/helpers/createVTKImageDataFromImage';
import { cache } from '@cornerstonejs/core';

export function fillSphere(
  enabledElement: Types.IEnabledElement,
  operationData: OperationData,
  _inside = true
): void {
  const { viewport } = enabledElement;
  const { segmentsLocked, segmentIndex, segmentationId, points } =
    operationData;

  const { currentImageId, imageIds, origin, zSpacing } =
    operationData.editData as EditDataStack;
  const imageData = createVTKImageDataFromImageId(currentImageId);
  // hack the imageData so pointInSurroundingSphereCallback can treat it like a volume

  // Hacking the dimensions
  const dimensions = imageData.getDimensions();
  dimensions[2] = imageIds.length;
  imageData.setDimensions(dimensions);

  // Hacking the spacing information.
  const spacing = imageData.getSpacing();
  spacing[2] = zSpacing;
  imageData.setSpacing(spacing);
  // Hacking the origin
  imageData.setOrigin(origin);
  const scalarIndex = [];

  const callback = ({ pointIJK, value }) => {
    if (segmentsLocked.includes(value)) {
      return;
    }
    const slice = pointIJK[2];
    const image = cache.getDerivedImage(imageIds[slice]);
    const scalarData = image.getPixelData();
    const index = pointIJK[1] * dimensions[0] + pointIJK[0];

    scalarData[index] = segmentIndex;
    scalarIndex.push(slice);
  };

  pointInSurroundingSphereCallback(
    imageData,
    [points[0], points[1]],
    callback,
    viewport as Types.IVolumeViewport
  );

  const minSlice = scalarIndex[0];
  const maxSlice = Math.floor(scalarIndex[scalarIndex.length - 1]);
  const sliceArray = Array.from(
    { length: maxSlice - minSlice + 1 },
    (v, k) => k + minSlice
  );

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
