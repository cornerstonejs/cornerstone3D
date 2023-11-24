import {
  StackViewport,
  getEnabledElement,
  Enums,
  getEnabledElementByIds,
  cache,
  utilities,
  Types,
  metaData,
} from '@cornerstonejs/core';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';
import Representations from '../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState';
import { LabelmapSegmentationDataStack } from '../../types/LabelmapTypes';
import { isVolumeSegmentation } from '../../tools/segmentation/strategies/utils/stackVolumeCheck';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import triggerSegmentationRender from '../../utilities/segmentation/triggerSegmentationRender';

const enable = function (element: HTMLDivElement): void {
  const { viewport } = getEnabledElement(element);

  if (!(viewport instanceof StackViewport)) {
    return;
  }

  element.addEventListener(
    Enums.Events.STACK_NEW_IMAGE,
    _imageChangeEventListener as EventListener
  );
  // this listener handles the segmentation modifications
  element.addEventListener(
    Enums.Events.IMAGE_RENDERED,
    _imageChangeEventListener as EventListener
  );
};

const disable = function (element: HTMLDivElement): void {
  const { viewport } = getEnabledElement(element);

  if (!(viewport instanceof StackViewport)) {
    return;
  }

  element.removeEventListener(
    Enums.Events.STACK_NEW_IMAGE,
    _imageChangeEventListener as EventListener
  );
  element.removeEventListener(
    Enums.Events.IMAGE_RENDERED,
    _imageChangeEventListener as EventListener
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
function _imageChangeEventListener(evt) {
  const eventData = evt.detail;
  const { viewportId, renderingEngineId } = eventData;
  const { viewport } = getEnabledElementByIds(
    viewportId,
    renderingEngineId
  ) as { viewport: Types.IStackViewport };

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

    if (isVolumeSegmentation(labelmapData)) {
      return;
    }

    const { imageIdReferenceMap } =
      labelmapData as LabelmapSegmentationDataStack;

    segmentationRepresentations[representation.segmentationRepresentationUID] =
      {
        imageIdReferenceMap,
      };
  });

  const representationList = Object.keys(segmentationRepresentations);
  const currentImageId = viewport.getCurrentImageId();
  const actors = viewport.getActors();

  actors.forEach((actor) => {
    if (representationList.includes(actor.uid)) {
      const segmentationActor = actor.actor;

      const { imageIdReferenceMap } = segmentationRepresentations[actor.uid];

      const derivedImageId = imageIdReferenceMap.get(currentImageId);

      const segmentationImageData = segmentationActor
        .getMapper()
        .getInputData();

      const derivedImage = cache.getImage(derivedImageId);

      const { origin, dimensions, spacing, direction } =
        viewport.getImageDataMetadata(derivedImage);

      segmentationImageData.setOrigin(origin);
      segmentationImageData.modified();

      if (segmentationImageData.getDimensions()[0] !== dimensions[0]) {
        // IMPORTANT: Not sure why we can't just update the dimensions
        // and the orientation of the image data and then call modified
        // I tried calling modified on everything, but seems like we should remove
        // and add the actor again below
        viewport.removeActors([actor.uid]);
        viewport.addImages(
          [
            {
              imageId: derivedImageId,
              actorUID: actor.uid,
              callback: ({ imageActor }) => {
                const scalarArray = vtkDataArray.newInstance({
                  name: 'Pixels',
                  numberOfComponents: 1,
                  values: [...derivedImage.getPixelData()],
                });

                const imageData = vtkImageData.newInstance();

                imageData.setDimensions(dimensions[0], dimensions[1], 1);
                imageData.setSpacing(spacing);
                imageData.setDirection(direction);
                imageData.setOrigin(origin);
                imageData.getPointData().setScalars(scalarArray);

                imageActor.getMapper().setInputData(imageData);
              },
            },
          ],
          true,
          false
        );

        triggerSegmentationRender(toolGroup.id);
        return;
      }

      utilities.updateVTKImageDataWithCornerstoneImage(
        segmentationImageData,
        derivedImage
      );
      viewport.render();

      // This is put here to make sure that the segmentation is rendered
      // for the initial image as well after that we don't need it since
      // stack new image is called when changing slices
      if (evt.type === Enums.Events.IMAGE_RENDERED) {
        // unsubscribe after the initial render
        viewport.element.removeEventListener(
          Enums.Events.IMAGE_RENDERED,
          _imageChangeEventListener as EventListener
        );
      }
    }
  });
}

export default {
  enable,
  disable,
};
