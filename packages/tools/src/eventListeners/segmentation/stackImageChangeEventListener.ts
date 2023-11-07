import {
  StackViewport,
  getEnabledElement,
  Enums,
  getEnabledElementByIds,
  cache,
  utilities,
  metaData,
} from '@cornerstonejs/core';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';
import Representations from '../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState';
import { LabelmapSegmentationDataStack } from 'tools/src/types/LabelmapTypes';

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
  const { viewport } = getEnabledElementByIds(viewportId, renderingEngineId);

  if (!(viewport instanceof StackViewport)) {
    return;
  }

  const toolGroup = getToolGroupForViewport(viewportId, renderingEngineId);
  let toolGroupSegmentationRepresentations =
    SegmentationState.getSegmentationRepresentations(toolGroup.id) || [];

  toolGroupSegmentationRepresentations =
    toolGroupSegmentationRepresentations.filter(
      (representation) => representation.type === Representations.Labelmap
    );

  if (!toolGroupSegmentationRepresentations?.length) {
    return;
  }

  const segmentationRepresentations = {};
  toolGroupSegmentationRepresentations.forEach((representation) => {
    const segmentation = SegmentationState.getSegmentation(
      representation.segmentationId
    );

    if (!segmentation) {
      return;
    }

    const labelmapData =
      segmentation.representationData[Representations.Labelmap];

    if ('volumeId' in labelmapData) {
      return;
    }

    const { referencedImageIds, imageIds } =
      labelmapData as LabelmapSegmentationDataStack;

    segmentationRepresentations[representation.segmentationRepresentationUID] =
      {
        referencedImageIds,
        segmentationImageIds: imageIds,
      };
  });

  const representationList = Object.keys(segmentationRepresentations);
  const imageId = viewport.getCurrentImageId();
  const actors = viewport.getActors();

  actors.forEach((actor) => {
    if (representationList.includes(actor.uid)) {
      const segmentationActor = actor.actor;

      const { referencedImageIds, segmentationImageIds } =
        segmentationRepresentations[actor.uid];

      const derivedImageId = getDerivedImageId(
        imageId,
        referencedImageIds,
        segmentationImageIds
      );

      const imageData = segmentationActor.getMapper().getInputData();
      const derivedImage = cache.getImage(derivedImageId);

      const { imagePositionPatient } = metaData.get(
        'imagePlaneModule',
        derivedImage?.referencedImageId || derivedImage.imageId
      );
      let origin = imagePositionPatient;

      if (origin == null) {
        origin = [0, 0, 0];
      }
      imageData.setOrigin(origin);

      utilities.updateVTKImageDataWithCornerstoneImage(imageData, derivedImage);
      viewport.render();
    }
  });
}

function getDerivedImageId(
  imageId: string,
  imageIds: Array<string>,
  derivedImageIds: Array<string>
) {
  const index = imageIds.indexOf(imageId);
  if (index > -1) {
    return derivedImageIds[index];
  }
}

export default {
  enable,
  disable,
};
