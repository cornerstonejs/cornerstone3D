import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { Types } from '@cornerstonejs/core';
import {
  BaseVolumeViewport,
  getEnabledElement,
  Enums,
  getEnabledElementByIds,
  cache,
  utilities,
} from '@cornerstonejs/core';
import { triggerSegmentationRender } from '../../stateManagement/segmentation/SegmentationRenderingEngine';
import { updateLabelmapSegmentationImageReferences } from '../../stateManagement/segmentation/updateLabelmapSegmentationImageReferences';
import { getCurrentLabelmapImageIdForViewport } from '../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';
import { SegmentationRepresentations } from '../../enums';
import { getLabelmapActorEntry } from '../../stateManagement/segmentation/helpers/getSegmentationActor';
import { getSegmentationRepresentations } from '../../stateManagement/segmentation/getSegmentationRepresentation';

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

  const representations = getSegmentationRepresentations(viewportId);

  if (!representations?.length) {
    return;
  }

  const labelmapRepresentations = representations.filter(
    (representation) =>
      representation.type === SegmentationRepresentations.Labelmap
  );

  const actors = viewport.getActors();

  // Update the maps
  labelmapRepresentations.forEach((representation) => {
    const { segmentationId } = representation;
    updateLabelmapSegmentationImageReferences(viewportId, segmentationId);
  });

  const labelmapActors = labelmapRepresentations
    .map((representation) => {
      return getLabelmapActorEntry(viewportId, representation.segmentationId);
    })
    .filter((actor) => actor !== undefined);

  if (!labelmapActors.length) {
    return;
  }

  // we need to check for the current viewport state with the current representations
  // is there any extra actor that needs to be removed
  // or any actor that needs to be added (which it is added later down), but remove
  // it here if it is not needed
  labelmapActors.forEach((actor) => {
    // if cannot find a representation for this actor means it has stuck around
    // form previous renderings and should be removed
    const validActor = labelmapRepresentations.find((representation) => {
      const derivedImageId = getCurrentLabelmapImageIdForViewport(
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
    const derivedImageId = getCurrentLabelmapImageIdForViewport(
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
      const constructor = derivedImage.voxelManager.getConstructor();
      const newPixelData = derivedImage.voxelManager.getScalarData();

      const scalarArray = vtkDataArray.newInstance({
        name: 'Pixels',
        numberOfComponents: 1,
        // @ts-expect-error
        values: new constructor(newPixelData),
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
          representationUID: `${segmentationId}-${SegmentationRepresentations.Labelmap}`,
          callback: ({ imageActor }) => {
            imageActor.getMapper().setInputData(imageData);
          },
        },
      ]);

      triggerSegmentationRender(viewportId);
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
