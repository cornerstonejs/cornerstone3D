import type { Types } from '@cornerstonejs/core';
import {
  cache,
  getEnabledElementByViewportId,
  VolumeViewport3D,
} from '@cornerstonejs/core';

import Representations from '../../../enums/SegmentationRepresentations';
import type { SegmentationRepresentation } from '../../../types/SegmentationStateTypes';
import { removeRepresentation as _removeRepresentation } from '../../../stateManagement/segmentation/removeRepresentation';
import removeSurfaceFromElement from './removeSurfaceFromElement';
import addOrUpdateSurfaceToElement from './addOrUpdateSurfaceToElement';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import { getColorLUT } from '../../../stateManagement/segmentation/getColorLUT';
import { canComputeRequestedRepresentation } from '../../../stateManagement/segmentation/polySeg/canComputeRequestedRepresentation';
import { computeAndAddSurfaceRepresentation } from '../../../stateManagement/segmentation/polySeg';

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

  removeSurfaceFromElement(viewport.element, segmentationRepresentationUID);
  _removeRepresentation(segmentationRepresentationUID);

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
  const { colorLUTIndex, segmentationId, segmentationRepresentationUID } =
    representation;

  const segmentation = getSegmentation(segmentationId);

  if (!segmentation) {
    return;
  }

  if (!(viewport instanceof VolumeViewport3D)) {
    throw new Error(
      'Surface rendering is only supported in 3D viewports, if you need to visualize the surface cuts in 2D viewports, you can use the Contour representation, see polySeg converters'
    );
  }

  let SurfaceData = segmentation.representationData[Representations.Surface];

  if (
    !SurfaceData &&
    canComputeRequestedRepresentation(segmentationRepresentationUID)
  ) {
    // we need to check if we can request polySEG to convert the other
    // underlying representations to Surface
    SurfaceData = await computeAndAddSurfaceRepresentation(segmentationId, {
      segmentationRepresentationUID,
    });

    if (!SurfaceData) {
      throw new Error(
        `No Surface data found for segmentationId ${segmentationId}.`
      );
    }
  }

  const { geometryIds } = SurfaceData;

  if (!geometryIds?.size) {
    console.warn(
      `No Surfaces found for segmentationId ${segmentationId}. Skipping render.`
    );
  }

  const colorLUT = getColorLUT(colorLUTIndex);

  const surfaces = [];
  geometryIds.forEach((geometryId, segmentIndex) => {
    const geometry = cache.getGeometry(geometryId);
    if (!geometry?.data) {
      console.warn(
        `No Surfaces found for geometryId ${geometryId}. Skipping render.`
      );
      return;
    }

    const surface = geometry.data as Types.ISurface;

    const color = colorLUT[segmentIndex];
    surface.setColor(color.slice(0, 3) as Types.Point3);

    addOrUpdateSurfaceToElement(
      viewport.element,
      surface as Types.ISurface,
      segmentationRepresentationUID
    );

    surfaces.push(surface);
  });

  viewport.render();
}

export default {
  render,
  removeRepresentation,
};

export { render, removeRepresentation };
