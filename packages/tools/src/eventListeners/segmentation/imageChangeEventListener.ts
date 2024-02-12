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
import { getToolGroupForViewport } from '../../store/ToolGroupManager';
import Representations from '../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState';
import { LabelmapSegmentationDataStack } from '../../types/LabelmapTypes';
import { isVolumeSegmentation } from '../../tools/segmentation/strategies/utils/stackVolumeCheck';
import triggerSegmentationRender from '../../utilities/segmentation/triggerSegmentationRender';

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

  if (!toolGroup) {
    return;
  }

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

    if (!segmentation || !segmentation.representationData?.LABELMAP) {
      return;
    }

    const labelmapData = segmentation.representationData.LABELMAP;

    if (isVolumeSegmentation(labelmapData, viewport)) {
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

  const segmentationFound = actors.find((actor) => {
    if (!representationList.includes(actor.uid)) {
      return false;
    }

    return true;
  });

  if (!segmentationFound) {
    // If the segmentation is not found, it could be because of some special cases
    // where we are in the process of updating the volume conversion to a stack while
    // the data is still coming in. In such situations, we should trigger the render
    // to ensure that the segmentation actors are created, even if the data arrives late.
    triggerSegmentationRender(toolGroup.id);

    // we should return here, since there is no segmentation actor to update
    // we will hit this function later on after the actor is created
    return;
  }

  actors.forEach((actor) => {
    if (!representationList.includes(actor.uid)) {
      return;
    }
    const segmentationActor = actor.actor;

    const { imageIdReferenceMap } = segmentationRepresentations[actor.uid];

    const derivedImageId = imageIdReferenceMap.get(currentImageId);

    const segmentationImageData = segmentationActor.getMapper().getInputData();

    if (!derivedImageId) {
      // this means that this slice doesn't have a segmentation for this representation
      // this can be a case where the segmentation was added to certain slices only
      // so we can keep the actor but empty out the imageData
      if (segmentationImageData.setDerivedImage) {
        // If the image data has a set derived image, then it should be called
        // to update any vtk or actor data associated with it.  In this case, null
        // is used to clear the data.  THis allows intercepting/alternative
        // to vtk calls.  Eventually the vtk version should also use this.
        segmentationImageData.setDerivedImage(null);
        return;
      }
      // This is the vtk version of the clearing out the image data, and fails
      // to work for non scalar image data.
      const scalarArray = vtkDataArray.newInstance({
        name: 'Pixels',
        numberOfComponents: 1,
        values: new Uint8Array(segmentationImageData.getNumberOfPoints()),
      });

      const imageData = vtkImageData.newInstance();
      imageData.getPointData().setScalars(scalarArray);
      segmentationActor.getMapper().setInputData(imageData);
      return;
    }

    const derivedImage = cache.getImage(derivedImageId);

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

    segmentationImageData.setOrigin(originToUse);
    segmentationImageData.modified();

    if (
      segmentationImageData.getDimensions()[0] !== dimensions[0] ||
      segmentationImageData.getDimensions()[1] !== dimensions[1]
    ) {
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
              imageData.setOrigin(originToUse);
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

    if (segmentationImageData.setDerivedImage) {
      // Update the derived image data, whether vtk or other as appropriate
      // to the actor(s) displaying the data.
      segmentationImageData.setDerivedImage(derivedImage);
    } else {
      // TODO - use setDerivedImage for this functionality
      utilities.updateVTKImageDataWithCornerstoneImage(
        segmentationImageData,
        derivedImage
      );
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
