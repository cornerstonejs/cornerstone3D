import {
  getEnabledElementByIds,
  getEnabledElementByViewportId,
  StackViewport,
  Types,
} from '@cornerstonejs/core';

import Representations from '../../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import { ContourRepresentation } from '../../../types/SegmentationStateTypes';
import removeContourFromElement from './removeContourFromElement';
import { deleteConfigCache } from './contourHandler/contourConfigCache';
import { polySeg } from '../../../stateManagement/segmentation';
import { handleContourSegmentation } from './contourHandler/handleContourSegmentation';

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

  SegmentationState.removeRepresentation(segmentationRepresentationUID);

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
  const segmentation = SegmentationState.getSegmentation(segmentationId);

  if (!segmentation) {
    return;
  }

  let contourData = segmentation.representationData[Representations.Contour];

  if (
    !contourData &&
    polySeg.canComputeRequestedRepresentation(
      contourRepresentation.segmentationRepresentationUID
    ) &&
    !polySegConversionInProgress
  ) {
    polySegConversionInProgress = true;

    contourData = await polySeg.computeAndAddContourRepresentation(
      segmentationId,
      {
        segmentationRepresentationUID:
          contourRepresentation.segmentationRepresentationUID,
        viewport,
      }
    );
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
