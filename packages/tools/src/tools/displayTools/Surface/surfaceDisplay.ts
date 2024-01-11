import {
  cache,
  getEnabledElementByIds,
  Types,
  Enums,
} from '@cornerstonejs/core';

import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import Representations from '../../../enums/SegmentationRepresentations';
import { getToolGroup } from '../../../store/ToolGroupManager';
import {
  SegmentationRepresentationConfig,
  ToolGroupSpecificRepresentation,
} from '../../../types/SegmentationStateTypes';

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
  representation: ToolGroupSpecificRepresentation,
  toolGroupConfig: SegmentationRepresentationConfig
): Promise<void> {
  const {
    colorLUTIndex,
    active,
    segmentationId,
    segmentationRepresentationUID,
    segmentsHidden,
  } = representation;

  const segmentation = SegmentationState.getSegmentation(segmentationId);
  let SurfaceData = segmentation.representationData[Representations.Surface];

  if (!SurfaceData) {
    // we need to check if we can request polySEG to convert the other
    // underlying representations to Surface
    SurfaceData = await polySeg.getComputedSurfaceData(segmentation);

    if (!SurfaceData) {
      throw new Error(
        `No Surface data found for segmentationId ${segmentationId}.`
      );
    }
  }

  const { geometryId } = SurfaceData;

  if (!geometryId) {
    console.warn(
      `No Surfaces found for segmentationId ${segmentationId}. Skipping render.`
    );
  }

  const geometry = cache.getGeometry(geometryId);
  if (!geometry) {
    throw new Error(`No Surfaces found for geometryId ${geometryId}`);
  }

  if (geometry.type !== Enums.GeometryType.SURFACE) {
    // Todo: later we can support converting other geometries to Surfaces
    throw new Error(
      `Geometry type ${geometry.type} not supported for rendering.`
    );
  }

  if (!geometry.data) {
    console.warn(
      `No Surfaces found for geometryId ${geometryId}. Skipping render.`
    );
    return;
  }

  const surface = geometry.data;

  const surfaceUID = `${segmentationRepresentationUID}_${surface.id}}`;
  _renderSurface(viewport, surface, surfaceUID);

  viewport.resetCamera();
  viewport.render();
}

function _renderSurface(
  viewport: Types.IVolumeViewport,
  surface: any,
  surfaceUID: string
): void {
  const actorUID = surfaceUID;
  addOrUpdateSurfaceToElement(viewport.element, surface, actorUID);
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
