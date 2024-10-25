import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import labelmapDisplay from '../../tools/displayTools/Labelmap/labelmapDisplay';
import contourDisplay from '../../tools/displayTools/Contour/contourDisplay';

import { getSegmentationRepresentations } from './getSegmentationRepresentation';
import { getEnabledElementByViewportId } from '@cornerstonejs/core';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { surfaceDisplay } from '../../tools/displayTools/Surface';

/**
 * Removes a segmentation representation from a viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param type - Optional. The type of segmentation representation to remove.
 * @param immediate - Optional. If true, the removal is performed immediately.
 *
 * @remarks
 * If a specific type is provided, only that representation type is removed.
 * If no type is specified, all representations for the segmentation are removed.
 */
function removeSegmentationRepresentation(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type: SegmentationRepresentations;
  },
  immediate?: boolean
): Array<{ segmentationId: string; type: SegmentationRepresentations }> {
  return _removeSegmentationRepresentations(viewportId, specifier, immediate);
}

/**
 * Removes all segmentation representations from a viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param type - Optional. The type of segmentation representation to remove.
 * @param immediate - Optional. If true, the removal is performed immediately.
 *
 * @remarks
 * If no specifier is provided, all segmentation representations for the viewport are removed.
 * If a segmentationId specifier is provided, only the segmentation representation with the specified segmentationId and type are removed.
 * If a type specifier is provided, only the segmentation representation with the specified type are removed.
 * If both a segmentationId and type specifier are provided, only the segmentation representation with the specified segmentationId and type are removed.
 */
function removeSegmentationRepresentations(
  viewportId: string,
  specifier: {
    segmentationId?: string;
    type?: SegmentationRepresentations;
  },
  immediate?: boolean
): Array<{ segmentationId: string; type: SegmentationRepresentations }> {
  return _removeSegmentationRepresentations(viewportId, specifier, immediate);
}

function _removeSegmentationRepresentations(
  viewportId: string,
  specifier: {
    segmentationId?: string;
    type?: SegmentationRepresentations;
  },
  immediate?: boolean
): Array<{ segmentationId: string; type: SegmentationRepresentations }> {
  const { segmentationId, type } = specifier;

  _removeRepresentationObject(viewportId, segmentationId, type, immediate);

  // Remove representation from state
  return defaultSegmentationStateManager.removeSegmentationRepresentations(
    viewportId,
    {
      segmentationId,
      type,
    }
  );
}

/**
 * Removes all segmentation representations from all viewports and resets the segmentation state.
 *
 * @remarks
 * This function iterates through all viewport segmentation representations,
 * removes each representation, and then resets the segmentation state.
 * It effectively clears all segmentation data from the application.
 *
 */
function removeAllSegmentationRepresentations(): void {
  const state =
    defaultSegmentationStateManager.getAllViewportSegmentationRepresentations();

  state.forEach(({ viewportId, representations }) => {
    representations.forEach(({ segmentationId, type }) => {
      removeSegmentationRepresentation(viewportId, {
        segmentationId,
        type,
      });
    });
  });
  defaultSegmentationStateManager.resetState();
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
    {
      segmentationId,
      type: SegmentationRepresentations.Labelmap,
    },
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
    {
      segmentationId,
      type: SegmentationRepresentations.Contour,
    },
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
    {
      segmentationId,
      type: SegmentationRepresentations.Surface,
    },
    immediate
  );
}

function _removeRepresentationObject(
  viewportId: string,
  segmentationId: string,
  type?: SegmentationRepresentations,
  immediate?: boolean
): void {
  const representations = getSegmentationRepresentations(viewportId, {
    segmentationId,
    type,
  });

  representations.forEach((representation) => {
    if (representation.type === SegmentationRepresentations.Labelmap) {
      labelmapDisplay.removeRepresentation(
        viewportId,
        representation.segmentationId,
        immediate
      );
    } else if (representation.type === SegmentationRepresentations.Contour) {
      contourDisplay.removeRepresentation(
        viewportId,
        representation.segmentationId,
        immediate
      );
    } else if (representation.type === SegmentationRepresentations.Surface) {
      surfaceDisplay.removeRepresentation(
        viewportId,
        representation.segmentationId,
        immediate
      );
    }
  });

  // trigger render for viewport
  const { viewport } = getEnabledElementByViewportId(viewportId) || {};
  if (viewport) {
    viewport.render();
  }
}

export {
  removeSegmentationRepresentation,
  removeSegmentationRepresentations,
  removeAllSegmentationRepresentations,
  removeLabelmapRepresentation,
  removeContourRepresentation,
  removeSurfaceRepresentation,
};
