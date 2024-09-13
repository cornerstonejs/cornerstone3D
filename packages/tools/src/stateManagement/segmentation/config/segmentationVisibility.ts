import {
  getSegmentationRepresentation,
  getSegmentationRepresentations,
} from '../getSegmentationRepresentation';
import { setSegmentationRepresentationVisibility as _setSegmentationRepresentationVisibility } from '../setSegmentationRepresentationVisibility';
import { getSegmentationRepresentationVisibility as _getSegmentationRepresentationVisibility } from '../getSegmentationRepresentationVisibility';
import type { SegmentationRepresentations } from '../../../enums';
import { triggerSegmentationRenderBySegmentationId } from '../SegmentationRenderingEngine';

/**
 * Sets the visibility of a segmentation representation for a given viewport.
 * It fires a SEGMENTATION_REPRESENTATION_MODIFIED event. Visibility true will show all segments
 * and visibility false will hide all segments.
 *
 * @param viewportId - The ID of the viewport that the segmentation representation belongs to.
 * @param specifier - The specifier for the segmentation representation.
 * @param specifier.segmentationId - The ID of the segmentation.
 * @param specifier.type - The type of the segmentation representation.
 * @param visibility - The visibility state to set for the segmentation representation.
 * @returns void
 *
 * @remarks
 * This function sets the visibility of a specific segmentation representation for a given viewport.
 * if the type is not specified, the visibility of all representations of the segmentation will be set.
 */
function setSegmentationRepresentationVisibility(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type?: SegmentationRepresentations;
  },
  visibility: boolean
): void {
  const representations = getSegmentationRepresentations(viewportId, specifier);

  if (!representations) {
    return;
  }

  representations.forEach((representation) => {
    _setSegmentationRepresentationVisibility(
      viewportId,
      {
        segmentationId: representation.segmentationId,
        type: representation.type,
      },
      visibility
    );
  });
}

/**
 * Gets the visibility of a segmentation representation for a given viewport.
 *
 * @param viewportId - The ID of the viewport that the segmentation representation belongs to.
 * @param segmentationId - The ID of the segmentation to get visibility for.
 * @param type - The type of segmentation representation.
 * @returns The visibility state of the segmentation representation, or undefined if not found.
 *
 */
function getSegmentationRepresentationVisibility(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type: SegmentationRepresentations;
  }
): boolean | undefined {
  return _getSegmentationRepresentationVisibility(viewportId, specifier);
}

/**
 * Sets the visibility of a single segment for a specific viewport and segmentation representation.
 *
 * @param viewportId - The ID of the viewport.
 * @param specifier - The specifier for the segmentation representation.
 * @param specifier.segmentationId - The ID of the segmentation.
 * @param specifier.type - The type of the segmentation representation.
 * @param segmentIndex - The index of the segment to modify.
 * @param visibility - The visibility status to set for the segment.
 *
 * @remarks
 * If the type is not specified, the visibility of all representations of the segmentation will be set.
 * If the type is specified, the visibility of the exact type representation will be set.
 */
function setSegmentIndexVisibility(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type?: SegmentationRepresentations;
  },
  segmentIndex: number,
  visibility: boolean
): void {
  const representations = getSegmentationRepresentations(viewportId, specifier);

  if (!representations) {
    return;
  }

  representations.forEach((representation) => {
    const hiddenSegments = representation.segmentsHidden ?? new Set();

    visibility
      ? hiddenSegments.delete(segmentIndex)
      : hiddenSegments.add(segmentIndex);
  });

  // Note: we should make sure to trigger here, since this does not go
  // through the SegmentationStateManager
  triggerSegmentationRenderBySegmentationId(specifier.segmentationId);
}

/**
 * Retrieves the visibility of a specific segment for a given viewport and segmentation representation.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param type - The type of segmentation representation.
 * @param segmentIndex - The index of the segment to check.
 * @returns True if the segment is visible, false otherwise.
 */
function getSegmentIndexVisibility(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type: SegmentationRepresentations;
  },
  segmentIndex: number
): boolean {
  const hiddenSegments = getHiddenSegmentIndices(viewportId, specifier);

  return !hiddenSegments.has(segmentIndex);
}

/**
 * Retrieves the hidden segment indices for a given viewport and segmentation representation.
 *
 * @param viewportId - The ID of the viewport.
 * @param specifier - The specifier for the segmentation representation.
 * @param specifier.segmentationId - The ID of the segmentation.
 * @param specifier.type - The type of the segmentation representation.
 * @returns A Set of hidden segment indices.
 */
function getHiddenSegmentIndices(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type: SegmentationRepresentations;
  }
): Set<number> {
  const representation = getSegmentationRepresentation(viewportId, specifier);

  if (!representation) {
    return new Set();
  }

  return representation.segmentsHidden ?? new Set();
}

export {
  setSegmentationRepresentationVisibility,
  getSegmentationRepresentationVisibility,
  setSegmentIndexVisibility,
  getSegmentIndexVisibility,
  getHiddenSegmentIndices,
};
