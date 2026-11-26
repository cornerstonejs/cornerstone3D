import { SegmentationRepresentations } from '../../enums';
import { getViewportContourCutsState } from '../../tools/displayTools/Contour/contourCuts';
import { getSegmentationRepresentation } from './getSegmentationRepresentation';

/**
 * Whether the cuts of a contour segmentation are all drawn on a viewport,
 * for the plane on display: the state that
 * `Events.SEGMENTATION_CONTOUR_CUTS_COMPLETED` announces, so a caller that
 * subscribes late asks it first and waits for the event only while it is
 * `'pending'`.
 *
 * - `'pending'` while the viewport has the Contour representation of the
 *   segmentation and its cut of the plane on display for the current
 *   contours is not drawn yet: the representation has not rendered on the
 *   viewport since it was added or since the contours changed, a change of
 *   plane waits for the plane to settle, or a conversion of the contours to
 *   a surface or a cut of a surface runs. The event fires when it ends.
 * - `'complete'` otherwise: the cuts are drawn, also when some segments
 *   failed (the event gives them); a viewport in the plane of the contours
 *   after the representation rendered on it (it needs no cut); a viewport
 *   without the representation, without slices (a 3D viewport) or that
 *   shows nothing; a segmentation without contour sets (`geometryIds` of
 *   its Contour representation data, as an RTSTRUCT gives them), whose
 *   contours are not cut.
 *
 * A scroll keeps the plane: every slice of the plane is cut at once, so the
 * state stays `'complete'` and no event fires.
 *
 * @param viewportId - The id of the viewport.
 * @param segmentationId - The id of the segmentation.
 * @returns `'pending'` or `'complete'`.
 */
function getContourCutsState(
  viewportId: string,
  segmentationId: string
): 'pending' | 'complete' {
  if (
    !getSegmentationRepresentation(viewportId, {
      segmentationId,
      type: SegmentationRepresentations.Contour,
    })
  ) {
    return 'complete';
  }

  return getViewportContourCutsState(viewportId, segmentationId);
}

export { getContourCutsState };
