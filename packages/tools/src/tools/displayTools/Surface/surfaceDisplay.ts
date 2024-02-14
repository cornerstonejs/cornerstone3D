import {
  cache,
  getEnabledElementByIds,
  Types,
  VolumeViewport3D,
} from '@cornerstonejs/core';

import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import Representations from '../../../enums/SegmentationRepresentations';
import { getToolGroup } from '../../../store/ToolGroupManager';
import { ToolGroupSpecificRepresentation } from '../../../types/SegmentationStateTypes';

import removeSurfaceFromElement from './removeSurfaceFromElement';
import addOrUpdateSurfaceToElement from './addOrUpdateSurfaceToElement';
import { polySeg } from '../../../stateManagement/segmentation';

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
function removeSegmentationRepresentation(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  renderImmediate = false
): void {
  _removeSurfaceFromToolGroupViewports(
    toolGroupId,
    segmentationRepresentationUID
  );
  SegmentationState.removeSegmentationRepresentation(
    toolGroupId,
    segmentationRepresentationUID
  );

  if (renderImmediate) {
    const viewportsInfo = getToolGroup(toolGroupId).getViewportsInfo();
    viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );
      enabledElement.viewport.render();
    });
  }
}

/**
 * It renders the Surface  for the given segmentation
 * @param viewport - The viewport object
 * @param representation - ToolGroupSpecificRepresentation
 * @param toolGroupConfig - This is the configuration object for the tool group
 */
async function render(
  viewport: Types.IVolumeViewport,
  representation: ToolGroupSpecificRepresentation
): Promise<void> {
  const { colorLUTIndex, segmentationId, segmentationRepresentationUID } =
    representation;

  const segmentation = SegmentationState.getSegmentation(segmentationId);

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
    polySeg.canComputeRequestedRepresentation(segmentationRepresentationUID)
  ) {
    // we need to check if we can request polySEG to convert the other
    // underlying representations to Surface
    SurfaceData = await polySeg.computeAndAddSurfaceRepresentation(
      segmentationId,
      {
        segmentationRepresentationUID,
      }
    );

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

  const colorLUT = SegmentationState.getColorLUT(colorLUTIndex);

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

function _removeSurfaceFromToolGroupViewports(
  toolGroupId: string,
  segmentationRepresentationUID: string
): void {
  const toolGroup = getToolGroup(toolGroupId);

  if (toolGroup === undefined) {
    throw new Error(`ToolGroup with ToolGroupId ${toolGroupId} does not exist`);
  }

  const { viewportsInfo } = toolGroup;

  for (const viewportInfo of viewportsInfo) {
    const { viewportId, renderingEngineId } = viewportInfo;
    const enabledElement = getEnabledElementByIds(
      viewportId,
      renderingEngineId
    );
    removeSurfaceFromElement(
      enabledElement.viewport.element,
      segmentationRepresentationUID
    );
  }
}

export default {
  render,
  removeSegmentationRepresentation,
};

export { render, removeSegmentationRepresentation };
