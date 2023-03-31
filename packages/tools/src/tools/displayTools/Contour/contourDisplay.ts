import {
  getEnabledElementByIds,
  Types,
  utilities as csUtils,
} from '@cornerstonejs/core';

import Representations from '../../../enums/SegmentationRepresentations';
import * as SegmentationConfig from '../../../stateManagement/segmentation/config/segmentationConfig';
import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import { getToolGroup } from '../../../store/ToolGroupManager';
import {
  RepresentationPublicInput,
  SegmentationRepresentationConfig,
  ToolGroupSpecificRepresentation,
} from '../../../types/SegmentationStateTypes';
import { addOrUpdateContourSets } from './addOrUpdateContourSets';
import removeContourFromElement from './removeContourFromElement';

/**
 * It adds a new segmentation representation to the segmentation state
 * @param toolGroupId - The id of the toolGroup that the segmentation
 * belongs to
 * @param representationInput - RepresentationPublicInput
 * @param toolGroupSpecificConfig - The configuration that is specific to the toolGroup.
 * @returns The segmentationRepresentationUID
 */
async function addSegmentationRepresentation(
  toolGroupId: string,
  representationInput: RepresentationPublicInput,
  toolGroupSpecificConfig?: SegmentationRepresentationConfig
): Promise<string> {
  const { segmentationId } = representationInput;
  const segmentationRepresentationUID = csUtils.uuidv4();
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
    const mergedConfig = csUtils.deepMerge(
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
 * It renders the contour sets for the given segmentation
 * @param viewport - The viewport object
 * @param representation - ToolGroupSpecificRepresentation
 * @param toolGroupConfig - This is the configuration object for the tool group
 */
async function render(
  viewport: Types.IVolumeViewport,
  representationConfig: ToolGroupSpecificRepresentation,
  toolGroupConfig: SegmentationRepresentationConfig
): Promise<void> {
  const { segmentationId } = representationConfig;
  const segmentation = SegmentationState.getSegmentation(segmentationId);
  const contourData = segmentation.representationData[Representations.Contour];
  const { geometryIds } = contourData;

  if (!geometryIds?.length) {
    console.warn(
      `No contours found for segmentationId ${segmentationId}. Skipping render.`
    );
  }

  // add the contour sets to the viewport
  addOrUpdateContourSets(
    viewport,
    geometryIds,
    representationConfig,
    toolGroupConfig
  );
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
