import { getEnabledElementByIds, Types } from '@cornerstonejs/core';

import Representations from '../../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import { getToolGroup } from '../../../store/ToolGroupManager';
import {
  SegmentationRepresentationConfig,
  ToolGroupSpecificRepresentation,
} from '../../../types/SegmentationStateTypes';
import removeContourFromElement from './removeContourFromElement';
import { deleteConfigCache } from './contourHandler/contourConfigCache';
import { polySeg } from '../../../stateManagement/segmentation';
import { handleContourSegmentation } from './contourHandler/handleContourSegmentation';

let polySegConversionInProgress = false;

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

  deleteConfigCache(segmentationRepresentationUID);

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

  if (!segmentation) {
    return;
  }

  let contourData = segmentation.representationData[Representations.Contour];

  if (
    !contourData &&
    polySeg.canComputeRequestedRepresentation(
      representationConfig.segmentationRepresentationUID
    ) &&
    !polySegConversionInProgress
  ) {
    polySegConversionInProgress = true;

    contourData = await polySeg.computeAndAddContourRepresentation(
      segmentationId,
      {
        segmentationRepresentationUID:
          representationConfig.segmentationRepresentationUID,
        viewport,
      }
    );
  }

  if (!contourData) {
    return;
  }

  if (contourData?.geometryIds?.length) {
    handleContourSegmentation(
      viewport,
      contourData.geometryIds,
      contourData.annotationUIDsMap,
      representationConfig,
      toolGroupConfig
    );
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
    removeContourFromElement(segmentationRepresentationUID, toolGroupId);
  }
}

export default {
  render,
  removeSegmentationRepresentation,
};
