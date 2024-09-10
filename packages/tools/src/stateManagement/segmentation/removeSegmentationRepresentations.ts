import { defaultSegmentationStateManager } from './SegmentationStateManager';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import labelmapDisplay from '../../tools/displayTools/Labelmap/labelmapDisplay';
import contourDisplay from '../../tools/displayTools/Contour/contourDisplay';

import {
  getSegmentationRepresentation,
  getSegmentationRepresentations,
} from './getSegmentationRepresentation';
import { getEnabledElementByViewportId } from '@cornerstonejs/core';

function removeSegmentationRepresentation(
  viewportId: string,
  segmentationId: string,
  type: SegmentationRepresentations,
  immediate?: boolean
): void {
  _removeRepresentation(viewportId, segmentationId, immediate);

  defaultSegmentationStateManager.removeSegmentationRepresentation(
    viewportId,
    segmentationId,
    type
  );
}

/**
 * Removes a labelmap representation from a viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param immediate - Optional. If true, the removal is performed immediately.
 */
function removeLabelmapRepresentation(
  viewportId: string,
  segmentationId: string,
  immediate?: boolean
): void {
  removeSegmentationRepresentation(
    viewportId,
    segmentationId,
    SegmentationRepresentations.Labelmap,
    immediate
  );
}

/**
 * Removes a contour representation from a viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param immediate - Optional. If true, the removal is performed immediately.
 */
function removeContourRepresentation(
  viewportId: string,
  segmentationId: string,
  immediate?: boolean
): void {
  removeSegmentationRepresentation(
    viewportId,
    segmentationId,
    SegmentationRepresentations.Contour,
    immediate
  );
}

/**
 * Removes a surface representation from a viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param immediate - Optional. If true, the removal is performed immediately.
 */
function removeSurfaceRepresentation(
  viewportId: string,
  segmentationId: string,
  immediate?: boolean
): void {
  removeSegmentationRepresentation(
    viewportId,
    segmentationId,
    SegmentationRepresentations.Surface,
    immediate
  );
}

function _removeRepresentation(
  viewportId,
  segmentationId: string,
  immediate?: boolean
): void {
  const representations = getSegmentationRepresentations(
    viewportId,
    segmentationId
  );

  representations.forEach((representation) => {
    const { type } = representation;

    if (type === SegmentationRepresentations.Labelmap) {
      labelmapDisplay.removeRepresentation(
        viewportId,
        segmentationId,
        immediate
      );
    } else if (type === SegmentationRepresentations.Contour) {
      contourDisplay.removeRepresentation(
        viewportId,
        segmentationId,
        immediate
      );
    } else {
      throw new Error(`The representation ${type} is not supported yet`);
    }
  });

  // trigger render for viewport
  const { viewport } = getEnabledElementByViewportId(viewportId);
  if (viewport) {
    viewport.render();
  }
}

export {
  removeSegmentationRepresentation,
  removeLabelmapRepresentation,
  removeContourRepresentation,
  removeSurfaceRepresentation,
};
