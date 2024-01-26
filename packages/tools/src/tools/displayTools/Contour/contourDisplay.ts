import {
  getEnabledElementByIds,
  Types,
  StackViewport,
  utilities as csUtils,
} from '@cornerstonejs/core';

import Representations from '../../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import {
  addRepresentationData,
  polySeg,
} from '../../../stateManagement/segmentation';
import { getToolGroup } from '../../../store/ToolGroupManager';
import {
  SegmentationRepresentationConfig,
  ToolGroupSpecificRepresentation,
} from '../../../types/SegmentationStateTypes';
import { addOrUpdateVTKContourSets } from './vtkContour/addOrUpdateVTKContourSets';
import removeContourFromElement from './removeContourFromElement';
import { deleteConfigCache } from './vtkContour/contourConfigCache';
import { addAnnotation } from '../../../stateManagement';

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

  const contourData = segmentation.representationData[Representations.Contour];

  const { geometryIds } = contourData;

  // this means we would like to use vtk actors for contour data
  // Note: We really should get out of

  if (viewport instanceof StackViewport) {
    // We don't have a good way to handle stack viewports for contours at the moment.
    // Plus, if we add a segmentation to one viewport, it gets added to all the viewports in the toolGroup too.
    return;
  }

  // add the contour sets to the viewport
  addOrUpdateVTKContourSets(
    viewport,
    geometryIds,
    representationConfig,
    toolGroupConfig
  );

  // if (contourData?.points?.length) {
  //   // contourData = createAnnotationsFromPoints(contourData.points);
  //   const contourSegmentationAnnotation = {
  //     annotationUID: csUtils.uuidv4(),
  //     data: {
  //       contour: {
  //         closed: true,
  //         polyline: contourData.points,
  //       },
  //       segmentation: {
  //         segmentationId,
  //         segmentIndex: 1, // Todo
  //         segmentationRepresentationUID:
  //           representationConfig.segmentationRepresentationUID,
  //       },
  //     },
  //     highlighted: false,
  //     invalidated: false,
  //     isLocked: false,
  //     isVisible: true,
  //     metadata: {
  //       toolName: 'PlanarFreehandContourSegmentationTool',
  //       FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
  //       viewPlaneNormal: viewport.getCamera().viewPlaneNormal,
  //     },
  //   };

  //   addAnnotation(contourSegmentationAnnotation, viewport.element);
  // } else if (
  //   !contourData &&
  //   polySeg.canComputeRequestedRepresentation(
  //     representationConfig.segmentationRepresentationUID
  //   )
  // ) {
  // contourData = await polySeg.computeAndAddContourRepresentation(
  //   segmentationId,
  //   {
  //     segmentationRepresentationUID:
  //       representationConfig.segmentationRepresentationUID,
  //     viewport,
  //   }
  // );
  // }

  // if (contourData?.geometryIds?.length) {
  //   handleVTKContour({
  //     viewport,
  //     representationConfig,
  //     toolGroupConfig,
  //     geometryIds: contourData.geometryIds,
  //   });
  // } else if (contourData.annotationUIDsMap?.size) {
  //   handleContourAnnotationSegmentation({
  //     viewport,
  //     representationConfig,
  //     toolGroupConfig,
  //     annotationUIDsMap: contourData.annotationUIDsMap,
  //   });
  // }
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
  removeSegmentationRepresentation,
};
