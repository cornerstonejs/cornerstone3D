import type { StackViewport, Types } from '@cornerstonejs/core';
import { getEnabledElementByViewportId } from '@cornerstonejs/core';

import Representations from '../../../enums/SegmentationRepresentations';
import type { ContourRepresentation } from '../../../types/SegmentationStateTypes';
import { deleteConfigCache } from './contourHandler/contourConfigCache';
import { handleContourSegmentation } from './contourHandler/handleContourSegmentation';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import { canComputeRequestedRepresentation } from '../../../stateManagement/segmentation/polySeg/canComputeRequestedRepresentation';
import { computeAndAddContourRepresentation } from '../../../stateManagement/segmentation/polySeg/Contour/computeAndAddContourRepresentation';

let polySegConversionInProgress = false;

/**
 * It removes a segmentation representation from the tool group's viewports and
 * from the segmentation state
 * @param toolGroupId - The toolGroupId of the toolGroup that the
 * segmentationRepresentation belongs to.
 * @param segmentationRepresentationUID - This is the unique identifier
 * for the segmentation representation.
 * @param renderImmediate - If true, the viewport will be rendered
 * immediately after the segmentation representation is removed.
 */
function removeRepresentation(
  viewportId: string,
  segmentationRepresentationUID: string,
  renderImmediate = false
): void {
  const enabledElement = getEnabledElementByViewportId(viewportId);
  if (!enabledElement) {
    return;
  }

  const { viewport } = enabledElement;

  deleteConfigCache(segmentationRepresentationUID);

  if (!renderImmediate) {
    return;
  }

  viewport.render();
}

/**
 * It renders the contour sets for the given segmentation
 * @param viewport - The viewport object
 * @param representation - SegmentationRepresentation
 * @param toolGroupConfig - This is the configuration object for the tool group
 */
async function render(
  viewport: StackViewport | Types.IVolumeViewport,
  contourRepresentation: ContourRepresentation
): Promise<void> {
  const { segmentationId } = contourRepresentation;
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation) {
    return;
  }

  let contourData = segmentation.representationData[Representations.Contour];

  if (
    !contourData &&
    canComputeRequestedRepresentation(
      contourRepresentation.segmentationRepresentationUID
    ) &&
    !polySegConversionInProgress
  ) {
    polySegConversionInProgress = true;

    contourData = await computeAndAddContourRepresentation(segmentationId, {
      segmentationRepresentationUID:
        contourRepresentation.segmentationRepresentationUID,
      viewport,
    });
  }

  if (!contourData) {
    return;
  }

  if (contourData?.geometryIds?.length) {
    handleContourSegmentation(
      viewport,
      contourData.geometryIds,
      contourData.annotationUIDsMap,
      contourRepresentation
    );
  }
}

export default {
  render,
  removeRepresentation,
};
