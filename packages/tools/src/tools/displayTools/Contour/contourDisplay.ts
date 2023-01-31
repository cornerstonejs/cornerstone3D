import {
  cache,
  getEnabledElementByIds,
  Types,
  utilities,
  Enums,
} from '@cornerstonejs/core';

import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import * as SegmentationConfig from '../../../stateManagement/segmentation/config/segmentationConfig';
import Representations from '../../../enums/SegmentationRepresentations';
import { getToolGroup } from '../../../store/ToolGroupManager';
import {
  RepresentationPublicInput,
  SegmentationRepresentationConfig,
  ToolGroupSpecificRepresentation,
} from '../../../types/SegmentationStateTypes';

import { deepMerge } from '../../../utilities';
import removeContourFromElement from './removeContourFromElement';
import addContourToElement from './addContourToElement';

/**
 * For each viewport, in the toolGroup it adds the segmentation labelmap
 * representation to its viewports.
 * @param toolGroup - the tool group that contains the viewports
 * @param representationInput - The segmentation representation input
 * @param toolGroupSpecificConfig - The configuration object for toolGroup
 *
 * @returns The UID of the new segmentation representation
 */
async function addSegmentationRepresentation(
  toolGroupId: string,
  representationInput: RepresentationPublicInput,
  toolGroupSpecificConfig?: SegmentationRepresentationConfig
): Promise<string> {
  const { segmentationId } = representationInput;
  const segmentationRepresentationUID = utilities.uuidv4();
  // Todo: make these configurable during representation input by user
  const segmentsHidden = new Set() as Set<number>;
  const visibility = true;
  const colorLUTIndex = 0;
  const active = true;
  const toolGroupSpecificRepresentation: ToolGroupSpecificRepresentation = {
    segmentationId,
    segmentationRepresentationUID,
    type: Representations.Contour,
    segmentsHidden,
    visibility,
    colorLUTIndex,
    active,
    segmentationRepresentationSpecificConfig: {},
    segmentSpecificConfig: {},
    config: {},
  };
  // Update the toolGroup specific configuration
  if (toolGroupSpecificConfig) {
    // Since setting configuration on toolGroup will trigger a segmentationRepresentation
    // update event, we don't want to trigger the event twice, so we suppress
    // the first one
    const currentToolGroupConfig =
      SegmentationConfig.getToolGroupSpecificConfig(toolGroupId);
    const mergedConfig = deepMerge(
      currentToolGroupConfig,
      toolGroupSpecificConfig
    );
    SegmentationConfig.setToolGroupSpecificConfig(toolGroupId, {
      renderInactiveSegmentations:
        mergedConfig.renderInactiveSegmentations || true,
      representations: {
        ...mergedConfig.representations,
      },
    });
  }
  SegmentationState.addSegmentationRepresentation(
    toolGroupId,
    toolGroupSpecificRepresentation
  );
  return segmentationRepresentationUID;
}

/**
 * For each viewport, and for each segmentation, set the segmentation for the viewport's enabled element
 * Initializes the global and viewport specific state for the segmentation in the
 * SegmentationStateManager.
 * @param toolGroup - the tool group that contains the viewports
 * @param segmentationRepresentationUID - The uid of the segmentation representation
 * @param renderImmediate - If true, there will be a render call after the labelmap is removed
 */
function removeSegmentationRepresentation(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  renderImmediate = false
): void {
  _removeContourFromToolGroupViewports(
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
 * It takes the enabled element, the segmentation Id, and the configuration, and
 * it sets the segmentation for the enabled element as a labelmap
 * @param enabledElement - The cornerstone enabled element
 * @param segmentationId - The id of the segmentation to be rendered.
 * @param configuration - The configuration object for the labelmap.
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
    visibility,
    segmentsHidden,
  } = representation;

  const segmentation = SegmentationState.getSegmentation(segmentationId);
  const contourData = segmentation.representationData[Representations.Contour];
  const { geometryIds } = contourData;

  if (!geometryIds || geometryIds.length === 0) {
    console.warn(
      `No contours found for segmentationId ${segmentationId}. Skipping render.`
    );
  }

  _renderContourSets(viewport, geometryIds, segmentationRepresentationUID);
}

function _renderContourSets(
  viewport,
  geometryIds,
  segmentationRepresentationUID
) {
  geometryIds.forEach((geometryId) => {
    const geometry = cache.getGeometry(geometryId);
    if (!geometry) {
      throw new Error(`No contours found for geometryId ${geometryId}`);
    }

    if (geometry.type !== Enums.GeometryType.CONTOUR) {
      // Todo: later we can support converting other geometries to contours
      throw new Error(
        `Geometry type ${geometry.type} not supported for rendering.`
      );
    }

    if (!geometry.data) {
      console.warn(
        `No contours found for geometryId ${geometryId}. Skipping render.`
      );
      return;
    }

    const contourSet = geometry.data;

    _renderContourSet(viewport, contourSet, segmentationRepresentationUID);
  });
}

function _renderContourSet(
  viewport: Types.IVolumeViewport,
  contourSet: Types.IContourSet,
  segmentationRepresentationUID: string
): void {
  contourSet.getContours().forEach((contour: Types.IContour, index) => {
    const contourUID = `${segmentationRepresentationUID}_${contourSet.id}_${index}}`;
    _renderContour(viewport, contour, contourUID);
  });

  viewport.resetCamera();
  viewport.render();
}

function _renderContour(
  viewport: Types.IVolumeViewport,
  contour: Types.IContour,
  contourUID: string
): void {
  const actorUID = contourUID;
  const actorEntry = viewport.getActor(actorUID);

  if (!actorEntry) {
    addContourToElement(viewport.element, contour, actorUID);
  } else {
    // actorEntry.actor.setVisibility(visibility);
  }
}

function _removeContourFromToolGroupViewports(
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
    removeContourFromElement(
      enabledElement.viewport.element,
      segmentationRepresentationUID
    );
  }
}

export default {
  render,
  addSegmentationRepresentation,
  removeSegmentationRepresentation,
};
