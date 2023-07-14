import { StackViewport, getRenderingEngine } from '@cornerstonejs/core';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';
import { updateVTKImageDataFromImageId } from '@cornerstonejs/core';
import Representations from '../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState';
import { LabelmapSegmentationDataStack } from 'tools/src/types/LabelmapTypes';
import getDerivedImageId from '../../../src/tools/segmentation/getDerivedImageId';

function getLabelmapStackRepresentationUIDsFromToolGroup(toolGroupID: string) {
  const toolGroupSegmentationRepresentations =
    SegmentationState.getSegmentationRepresentations(toolGroupID);
  const segmentationRepresentations = {};
  toolGroupSegmentationRepresentations.forEach((representation) => {
    if (representation.type === Representations.Labelmap) {
      const segmentation = SegmentationState.getSegmentation(
        representation.segmentationId
      );
      const labelmapData =
        segmentation.representationData[Representations.Labelmap];
      if (labelmapData?.type === 'stack') {
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
  return segmentationRepresentations;
}

export default function stackImageChangeEventListener(evt) {
  const eventData = evt.detail;
  const { viewportId, renderingEngineId } = eventData;
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId);

  // Get the volume viewport
  const viewport = renderingEngine.getViewport(viewportId);

  if (viewport instanceof StackViewport) {
    const toolGroup = getToolGroupForViewport(viewportId, renderingEngineId);
    const segmentationRepresentations =
      getLabelmapStackRepresentationUIDsFromToolGroup(toolGroup.id);

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
}
