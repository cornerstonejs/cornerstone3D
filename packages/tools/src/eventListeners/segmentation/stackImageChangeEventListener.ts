import { getEnabledElement, StackViewport } from '@cornerstonejs/core';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';
import { updateVTKImageDataFromImageId } from '../../../../core/src/RenderingEngine/helpers/updateVTKImageDataFromImage';
import Representations from '../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState';

function getLabelmapStackRepresentationUIDsFromToolGroup(
  toolGroupID: string
): Array<string> {
  const toolGroupSegmentationRepresentations =
    SegmentationState.getSegmentationRepresentations(toolGroupID);
  const segmentationRepresentations = [];
  toolGroupSegmentationRepresentations.forEach((representation) => {
    if (representation.type === Representations.Labelmap) {
      const segmentation = SegmentationState.getSegmentation(
        representation.segmentationId
      );
      const labelmapData =
        segmentation.representationData[Representations.Labelmap];
      if (labelmapData?.type === 'stack') {
        segmentationRepresentations.push(
          representation.segmentationRepresentationUID
        );
      }
    }
  });
  return segmentationRepresentations;
}

export default function stackImageChangeEventListener(evt) {
  const eventData = evt.detail;
  const { element } = eventData;
  const { viewport, viewportId, renderingEngineId } =
    getEnabledElement(element);
  if (viewport instanceof StackViewport) {
    const toolGroup = getToolGroupForViewport(viewportId, renderingEngineId);
    const segmentationRepresentations =
      getLabelmapStackRepresentationUIDsFromToolGroup(toolGroup.id);

    const imageId = viewport.getCurrentImageId();
    const actors = viewport.getActors();
    actors.forEach((actor) => {
      if (segmentationRepresentations.includes(actor.uid)) {
        updateVTKImageDataFromImageId(
          imageId,
          actor.actor.getMapper().getInputData()
        );
      }
    });
    viewport.render();
  }
}
