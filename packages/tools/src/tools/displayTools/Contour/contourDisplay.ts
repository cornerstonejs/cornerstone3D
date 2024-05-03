import {
  getEnabledElementByIds,
  Types,
  BaseVolumeViewport,
} from '@cornerstonejs/core';

import Representations from '../../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import { getToolGroup } from '../../../store/ToolGroupManager';
import {
  SegmentationRepresentationConfig,
  ToolGroupSpecificRepresentation,
} from '../../../types/SegmentationStateTypes';
import { addOrUpdateVTKContourSets } from './vtkContour/addOrUpdateVTKContourSets';
import removeContourFromElement from './removeContourFromElement';
import { deleteConfigCache } from './vtkContour/contourConfigCache';
import { polySeg } from '../../../stateManagement/segmentation';

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

  // From here to below it is basically the legacy geometryId based
  // contour rendering via vtkActors that has some bugs for display,
  // as it sometimes appear and sometimes not, and it is not clear.
  // We have moved to the new SVG based contours via our annotation tools
  // check out annotationUIDsMap in the ContourSegmentationData type
  const { geometryIds } = contourData;

  if (!geometryIds?.length || !(viewport instanceof BaseVolumeViewport)) {
    return;
  }

  // add the contour sets to the viewport
  addOrUpdateVTKContourSets(
    viewport,
    geometryIds,
    representationConfig,
    toolGroupConfig
  );

  /**
   * The following logic could be added if we want to support the use case
   * where the contour representation data is initiated using annotations
   * in the state from the get-go , and not when the user draws a contour.
   */
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
