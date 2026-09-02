import type { Types } from '@cornerstonejs/core';
import { cache, getEnabledElementByViewportId } from '@cornerstonejs/core';

import Representations from '../../../enums/SegmentationRepresentations';
import type { SegmentationRepresentation } from '../../../types/SegmentationStateTypes';
import removeSurfaceFromElement from './removeSurfaceFromElement';
import addOrUpdateSurfaceToElement from './addOrUpdateSurfaceToElement';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import { getColorLUT } from '../../../stateManagement/segmentation/getColorLUT';
import { getPolySeg } from '../../../config';
import { computeAndAddRepresentation } from '../../../utilities/segmentation/computeAndAddRepresentation';
import { internalGetHiddenSegmentIndices } from '../../../stateManagement/segmentation/helpers/internalGetHiddenSegmentIndices';

// Guards against launching a second polySeg surface conversion for a
// segmentation while one is already running. Every re-render (and every viewport
// showing the segmentation) would otherwise kick off another concurrent
// conversion; each allocates the full labelmap scalar array, so a large volume
// with several segments exhausts memory, the workers never reach progress:100,
// and the "Converting Labelmap to Surface" toast hangs forever. Keyed by
// segmentationId (not viewport) so several 3D viewports of the same segmentation
// share a single conversion rather than each starting their own.
const polySegConversionInProgressForSegmentation = new Set<string>();

/**
 * It removes a segmentation representation from the tool group's viewports and
 * from the segmentation state
 * @param toolGroupId - The toolGroupId of the toolGroup that the
 * segmentation belongs to.
 * @param segmentationId - This is the unique identifier
 * for the segmentation.
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

  removeSurfaceFromElement(viewport.element, segmentationId);

  if (!renderImmediate) {
    return;
  }

  viewport.render();
}

/**
 * It renders the Surface  for the given segmentation
 * @param viewport - The viewport object
 * @param representation - SegmentationRepresentation
 * @param toolGroupConfig - This is the configuration object for the tool group
 */
async function render(
  viewport: Types.IVolumeViewport | Types.IStackViewport,
  representation: SegmentationRepresentation
): Promise<void> {
  const { segmentationId, type } = representation;

  const segmentation = getSegmentation(segmentationId);

  if (!segmentation) {
    return;
  }

  let SurfaceData = segmentation.representationData[Representations.Surface];

  if (
    !SurfaceData &&
    getPolySeg()?.canComputeRequestedRepresentation(
      segmentationId,
      Representations.Surface
    ) &&
    !polySegConversionInProgressForSegmentation.has(segmentationId)
  ) {
    // we need to check if we can request polySEG to convert the other
    // underlying representations to Surface
    const polySeg = getPolySeg();

    polySegConversionInProgressForSegmentation.add(segmentationId);

    try {
      SurfaceData = await computeAndAddRepresentation(
        segmentationId,
        Representations.Surface,
        () => polySeg.computeSurfaceData(segmentationId, { viewport })
      );
    } catch (error) {
      console.warn(
        'Unable to compute surface data for segmentationId',
        segmentationId,
        error
      );
    } finally {
      polySegConversionInProgressForSegmentation.delete(segmentationId);
    }
  } else if (!SurfaceData && !getPolySeg()) {
    console.debug(
      `No surface data found for segmentationId ${segmentationId} and PolySeg add-on is not configured. Unable to convert from other representations to surface. Please register PolySeg using cornerstoneTools.init({ addons: { polySeg } }) to enable automatic conversion.`
    );
  }

  if (!SurfaceData) {
    console.warn(
      `No Surface data found for segmentationId ${segmentationId}. Skipping render.`
    );
    return;
  }

  const { geometryIds } = SurfaceData;

  if (!geometryIds?.size) {
    console.warn(
      `No Surfaces found for segmentationId ${segmentationId}. Skipping render.`
    );
  }

  const { colorLUTIndex } = representation;

  const colorLUT = getColorLUT(colorLUTIndex);

  const surfaces = [];
  geometryIds.forEach((geometryId) => {
    const geometry = cache.getGeometry(geometryId) as Types.IGeometry;

    if (!geometry?.data) {
      console.warn(
        `No Surfaces found for geometryId ${geometryId}. Skipping render.`
      );
      return;
    }
    const { segmentIndex } = geometry.data as Types.ISurface;

    const hiddenSegments = internalGetHiddenSegmentIndices(viewport.id, {
      segmentationId,
      type,
    });
    const isHidden = hiddenSegments.has(segmentIndex);

    const surface = geometry.data as Types.ISurface;

    const color = colorLUT[segmentIndex];
    surface.color = color.slice(0, 3) as Types.Point3;
    surface.visible = !isHidden;

    surfaces.push(surface);
    addOrUpdateSurfaceToElement(
      viewport as Types.IVolumeViewport,
      surface as Types.ISurface,
      segmentationId
    );
  });

  viewport.render();
}

function getUpdateFunction(
  viewport: Types.IVolumeViewport | Types.IStackViewport
): (segmentationId: string) => Promise<void> {
  const polySeg = getPolySeg();
  return (segmentationId: string) =>
    polySeg.updateSurfaceData(segmentationId, { viewport });
}

export default {
  getUpdateFunction,
  render,
  removeRepresentation,
};

export { getUpdateFunction, render, removeRepresentation };
