import type { Types } from '@cornerstonejs/core';
import { getEnabledElementByViewportId } from '@cornerstonejs/core';

import Representations from '../../../enums/SegmentationRepresentations';
import { handleContourSegmentation } from './contourHandler/handleContourSegmentation';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import type { ContourRepresentation } from '../../../types/SegmentationStateTypes';
import removeContourFromElement from './removeContourFromElement';
import { getPolySeg } from '../../../config';
import { computeAndAddRepresentation } from '../../../utilities/segmentation/computeAndAddRepresentation';
import { removeContourCuts, updateContourCuts } from './contourCuts';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'tools.displayTools.Contour.contourDisplay'
);

const polySegConversionInProgressForViewportId = new Map<string, boolean>();

/**
 * It removes a segmentation representation from the tool group's viewports and
 * from the segmentation state
 * @param viewportId - The id of the viewport
 * @param segmentationId - The id of the segmentation
 * @param renderImmediate - If true, the viewport will be rendered immediately after the segmentation representation is removed
 */
function removeRepresentation(
  viewportId: string,
  segmentationId: string,
  renderImmediate = false
): void {
  removeContourCuts(viewportId, segmentationId);

  const enabledElement = getEnabledElementByViewportId(viewportId);
  if (!enabledElement) {
    return;
  }

  const { viewport } = enabledElement;

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
  viewport: Types.IViewport,
  contourRepresentation: ContourRepresentation
): Promise<void> {
  const { segmentationId } = contourRepresentation;
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation) {
    return;
  }

  let contourData = segmentation.representationData[Representations.Contour];
  const polySeg = getPolySeg();

  if (
    !contourData &&
    getPolySeg()?.canComputeRequestedRepresentation(
      segmentationId,
      Representations.Contour
    ) &&
    !polySegConversionInProgressForViewportId.get(viewport.id)
  ) {
    polySegConversionInProgressForViewportId.set(viewport.id, true);

    try {
      contourData = await computeAndAddRepresentation(
        segmentationId,
        Representations.Contour,
        () => polySeg.computeContourData(segmentationId, { viewport })
      );
    } catch (error) {
      cs3dLogger.warn(
        'Unable to compute contour data for segmentationId',
        segmentationId,
        error
      );
    }

    polySegConversionInProgressForViewportId.set(viewport.id, false);
  } else if (!contourData && !getPolySeg()) {
    cs3dLogger.debug(
      `No contour data found for segmentationId ${segmentationId} and PolySeg add-on is not configured. Unable to convert from other representations to contour. Please register PolySeg using cornerstoneTools.init({ addons: { polySeg } }) to enable automatic conversion.`
    );
  }

  if (!contourData) {
    return;
  }

  if (!contourData.geometryIds?.length) {
    return;
  }

  handleContourSegmentation(
    viewport,
    contourData.geometryIds,
    contourData.annotationUIDsMap,
    contourRepresentation
  );

  updateContourCuts(viewport, segmentationId);
}

/**
 * Default function to call when segmentation representation is updated
 *
 * @param viewport
 * @returns
 */
function getUpdateFunction(
  viewport: Types.IViewport
): (segmentationId: string) => Promise<void> {
  return null;
}

export default {
  getUpdateFunction,
  render,
  removeRepresentation,
};
