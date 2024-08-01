import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import {
  BaseVolumeViewport,
  getEnabledElement,
  Enums,
  getEnabledElementByIds,
  cache,
  utilities,
  Types,
} from '@cornerstonejs/core';
import Representations from '../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState';
import { triggerSegmentationRender } from '../../utilities/segmentation/triggerSegmentationRender';

const enable = function (element: HTMLDivElement): void {
  const { viewport } = getEnabledElement(element);

  if (viewport instanceof BaseVolumeViewport) {
    return;
  }

  element.addEventListener(
    Enums.Events.STACK_NEW_IMAGE,
    _imageChangeEventListener as EventListener
  );
  // this listener handles the segmentation modifications
  // we only listen to the image_rendered once and then remove it
  // the main event to listen here is the stack_new_image
  element.addEventListener(
    Enums.Events.IMAGE_RENDERED,
    _imageChangeEventListener as EventListener
  );
};

const disable = function (element: HTMLDivElement): void {
  element.removeEventListener(
    Enums.Events.STACK_NEW_IMAGE,
    _imageChangeEventListener as EventListener
  );
  element.removeEventListener(
    Enums.Events.IMAGE_RENDERED,
    _imageChangeEventListener as EventListener
  );
};

const perViewportManualTriggers = new Map();

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

  const segmentationRepresentations =
    SegmentationState.getSegmentationRepresentations(viewportId);

  if (!segmentationRepresentations?.length) {
    return;
  }

  const labelmapRepresentations = segmentationRepresentations.filter(
    (representation) => representation.type === Representations.Labelmap
  );

  if (!labelmapRepresentations.length) {
    return;
  }

  const actors = viewport.getActors();

  // Update the maps
  labelmapRepresentations.forEach((representation) => {
    const { segmentationId } = representation;
    const labelmapImageId = SegmentationState.updateSegmentationImageReferences(
      viewportId,
      segmentationId
    );
  });

  // const segmentationFound = actors.find((actor) => {
  //   if (!representationList.includes(actor.uid)) {
  //     return false;
  //   }

  //   return true;
  // });

  // if (!segmentationFound) {
  //   // If the segmentation is not found, it could be because of some special cases
  //   // where we are in the process of updating the volume conversion to a stack while
  //   // the data is still coming in. In such situations, we should trigger the render
  //   // to ensure that the segmentation actors are created, even if the data arrives late.

  //   if (!perViewportManualTriggers.has(viewportId)) {
  //     perViewportManualTriggers.set(viewportId, true);
  //     triggerSegmentationRenderForViewports([viewportId]);
  //   }

  //   // we should return here, since there is no segmentation actor to update
  //   // we will hit this function later on after the actor is created
  //   return;
  // }

  // we need to check for the current viewport state with the current representations
  // is there any extra actor that needs to be removed
  // or any actor that needs to be added (which it is added later down), but remove
  // it here if it is not needed

  const allLabelmapActors = actors.filter((actor) =>
    labelmapRepresentations.some(
      (representation) =>
        representation.segmentationRepresentationUID === actor.uid
    )
  );

  allLabelmapActors.forEach((actor) => {
    // if cannot find a representation for this actor means it has stuck around
    // form previous renderings and should be removed
    const validActor = labelmapRepresentations.find((representation) => {
      const derivedImageId =
        SegmentationState.getCurrentLabelmapImageIdForViewport(
          viewportId,
          representation.segmentationId
        );

      return derivedImageId === actor.referencedId;
    });

    if (!validActor) {
      viewport.removeActors([actor.uid]);
    }
  });

  labelmapRepresentations.forEach((representation) => {
    const { segmentationId } = representation;
    const currentImageId = viewport.getCurrentImageId();
    const derivedImageId =
      SegmentationState.getCurrentLabelmapImageIdForViewport(
        viewportId,
        segmentationId
      );

    if (!derivedImageId) {
      return;
    }
    const derivedImage = cache.getImage(derivedImageId);

    if (!derivedImage) {
      console.warn(
        'No derived image found in the cache for segmentation representation',
        representation
      );
      return;
    }

    // re-use the old labelmap actor for the new image labelmap for speed and memory
    const segmentationActorInput = actors.find(
      (actor) => actor.referencedId === derivedImageId
    );

    if (!segmentationActorInput) {
      // i guess we need to create here
      const { dimensions, spacing, direction } =
        viewport.getImageDataMetadata(derivedImage);

      const currentImage =
        cache.getImage(currentImageId) ||
        ({
          imageId: currentImageId,
        } as Types.IImage);

      const { origin: currentOrigin } =
        viewport.getImageDataMetadata(currentImage);

      // IMPORTANT: We need to make sure that the origin of the segmentation
      // is the same as the current image origin. This is because due to some
      // floating point precision issues, when coming from volume to stack
      // the origin of the segmentation can be slightly different from the
      // current image origin. This can cause the segmentation to be rendered
      // in the wrong location.
      // Todo: This will not work for segmentations that are not in the same frame
      // of reference or derived from the same image. This can happen when we have
      // a segmentation that happens to exist in the same space as the image but is
      // not derived from it. We need to find a way to handle this case, but don't think
      // it makes sense to do it for the stack viewport, as the volume viewport is designed to handle this case.
      const originToUse = currentOrigin;

      const scalarArray = vtkDataArray.newInstance({
        name: 'Pixels',
        numberOfComponents: 1,
        values: [...derivedImage.voxelManager.getScalarData()],
      });

      const imageData = vtkImageData.newInstance();

      imageData.setDimensions(dimensions[0], dimensions[1], 1);
      imageData.setSpacing(spacing);
      imageData.setDirection(direction);
      imageData.setOrigin(originToUse);
      imageData.getPointData().setScalars(scalarArray);
      imageData.modified();

      viewport.addImages([
        {
          imageId: derivedImageId,
          actorUID: representation.segmentationRepresentationUID,
          callback: ({ imageActor }) => {
            imageActor.getMapper().setInputData(imageData);
          },
        },
      ]);

      triggerSegmentationRender();
      return;
    } else {
      // if actor found
      // update the image data

      const segmentationImageData = segmentationActorInput.actor
        .getMapper()
        .getInputData();

      if (segmentationImageData.setDerivedImage) {
        // Update the derived image data, whether vtk or other as appropriate
        // to the actor(s) displaying the data.
        segmentationImageData.setDerivedImage(derivedImage);
      } else {
        utilities.updateVTKImageDataWithCornerstoneImage(
          segmentationImageData,
          derivedImage
        );
      }
    }

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
  });
}

export default {
  enable,
  disable,
};
