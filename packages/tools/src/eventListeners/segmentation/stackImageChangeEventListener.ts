import { StackViewport, getEnabledElement, Enums } from '@cornerstonejs/core';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';
// import { updateVTKImageDataFromImageId } from '@cornerstonejs/core';
import Representations from '../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState';
import { LabelmapSegmentationDataStack } from 'tools/src/types/LabelmapTypes';
// import getDerivedImageId from '../../../src/tools/segmentation/getDerivedImageId';

const enable = function (element: HTMLDivElement): void {
  const { viewport } = getEnabledElement(element);

  if (!(viewport instanceof StackViewport)) {
    return;
  }

  element.addEventListener(
    Enums.Events.STACK_NEW_IMAGE,
    _stackImageChangeEventListener as EventListener
  );
  // this listener handles the segmentation modifications
  element.addEventListener(
    Enums.Events.IMAGE_RENDERED,
    _stackImageChangeEventListener as EventListener
  );
};

const disable = function (element: HTMLDivElement): void {
  const { viewport } = getEnabledElement(element);

  if (!(viewport instanceof StackViewport)) {
    return;
  }

  element.removeEventListener(
    Enums.Events.STACK_NEW_IMAGE,
    _stackImageChangeEventListener as EventListener
  );
  element.removeEventListener(
    Enums.Events.IMAGE_RENDERED,
    _stackImageChangeEventListener as EventListener
  );
};

/**
 *  When the image is rendered, check what tools can be rendered for this element.
 *
 * - First we get all tools which are active, passive or enabled on the element.
 * - If any of these tools have a `renderAnnotation` method, then we render them.
 * - Note that these tools don't necessarily have to be instances of  `AnnotationTool`,
 *   Any tool may register a `renderAnnotation` method (e.g. a tool that displays an overlay).
 *
 * @param evt - The normalized IMAGE_RENDERED event.
 */
function _stackImageChangeEventListener(evt) {
  const eventData = evt.detail;
  const { viewportId, renderingEngineId } = eventData;

  const toolGroup = getToolGroupForViewport(viewportId, renderingEngineId);
  const toolGroupSegmentationRepresentations =
    SegmentationState.getSegmentationRepresentations(toolGroup.id);

  if (!toolGroupSegmentationRepresentations?.length) {
    return;
  }

  debugger;
  const segmentationRepresentations = {};
  toolGroupSegmentationRepresentations.forEach((representation) => {
    if (representation.type === Representations.Labelmap) {
      const segmentation = SegmentationState.getSegmentation(
        representation.segmentationId
      );
      const labelmapData =
        segmentation.representationData[Representations.Labelmap];
      if (!labelmapData?.volumeId) {
        const { referencedImageIds, imageIds } =
          labelmapData as LabelmapSegmentationDataStack;
        segmentationRepresentations[
          representation.segmentationRepresentationUID
        ] = {
          referencedImageIds,
          segmentationImageIds: imageIds,
        };
      }
    }
  });

  const representationList = Object.keys(segmentationRepresentations);
  const imageId = viewport.getCurrentImageId();
  const actors = viewport.getActors();
  actors.forEach((actor) => {
    if (representationList.includes(actor.uid)) {
      const { referencedImageIds, segmentationImageIds } =
        segmentationRepresentations[actor.uid];
      updateVTKImageDataFromImageId(
        getDerivedImageId(imageId, referencedImageIds, segmentationImageIds),
        actor.actor.getMapper().getInputData()
      );
    }
  });
}

export default {
  enable,
  disable,
};
