import type { StackViewport, Types } from '@cornerstonejs/core';
import { getEnabledElementByViewportId } from '@cornerstonejs/core';

import Representations from '../../../enums/SegmentationRepresentations';
import { handleContourSegmentation } from './contourHandler/handleContourSegmentation';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import { canComputeRequestedRepresentation } from '../../../stateManagement/segmentation/polySeg/canComputeRequestedRepresentation';
import { computeAndAddContourRepresentation } from '../../../stateManagement/segmentation/polySeg/Contour/computeAndAddContourRepresentation';
import type { ContourRepresentation } from '../../../types/SegmentationStateTypes';
import removeContourFromElement from './removeContourFromElement';

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
  segmentationId: string,
  renderImmediate = false
): void {
  const enabledElement = getEnabledElementByViewportId(viewportId);
  if (!enabledElement) {
    return;
  }

  const { viewport } = enabledElement;

  if (!renderImmediate) {
    return;
  }

  removeContourFromElement(viewportId, segmentationId);

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
      segmentationId,
      Representations.Contour
    ) &&
    !polySegConversionInProgress
  ) {
    polySegConversionInProgress = true;

    contourData = await computeAndAddContourRepresentation(segmentationId, {
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
