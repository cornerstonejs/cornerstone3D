import {
  StackViewport,
  getEnabledElement,
  Enums,
  getEnabledElementByIds,
  cache,
  utilities,
  metaData,
  Types,
} from '@cornerstonejs/core';
import {
  getAllToolGroups,
  getToolGroupForViewport,
} from '../../store/ToolGroupManager';
import Representations from '../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState';
import { LabelmapSegmentationDataStack } from 'tools/src/types/LabelmapTypes';
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

    const { referencedImageIds, imageIds } =
      labelmapData as LabelmapSegmentationDataStack;

    segmentationRepresentations[representation.segmentationRepresentationUID] =
      {
        referencedImageIds,
        segmentationImageIds: imageIds,
      };
  });

  const representationList = Object.keys(segmentationRepresentations);
  const currentImageId = viewport.getCurrentImageId();
  const actors = viewport.getActors();

  actors.forEach((actor) => {
    if (representationList.includes(actor.uid)) {
      const segmentationActor = actor.actor;

      const { referencedImageIds, segmentationImageIds } =
        segmentationRepresentations[actor.uid];

      const derivedImageId = getDerivedImageId(
        currentImageId,
        referencedImageIds,
        segmentationImageIds
      );

      const segmentationImageData = segmentationActor
        .getMapper()
        .getInputData();

      const derivedImage = cache.getImage(derivedImageId);

      const { origin, dimensions, spacing, direction } =
        viewport.getImageDataMetadata(derivedImage);

      segmentationImageData.setOrigin(origin);
      segmentationImageData.modified();

      if (segmentationImageData.getDimensions()[0] !== dimensions[0]) {
        viewport.removeActors([actor.uid]);
        viewport.addImages(
          [
            {
              imageId: derivedImageId,
              actorUID: actor.uid,
              callback: ({ imageActor }) => {
                // update the image data
                //  segmentationImageData.setDimensions(
                //    dimensions[0],
                //    dimensions[1],
                //    1
                //  );
                //  segmentationImageData.setSpacing(spacing);
                //  segmentationImageData.setDirection(direction);
                //  segmentationImageData.setOrigin(origin);

                const scalarArray = vtkDataArray.newInstance({
                  name: 'Pixels 2',
                  numberOfComponents: 1,
                  values: [...derivedImage.getPixelData()],
                });

                //  segmentationImageData
                //    .getPointData()
                //    .setScalars(scalarArray as any);

                //  segmentationImageData.modified();

                //  segmentationActor.modified();
                const imageData = vtkImageData.newInstance();

                imageData.setDimensions(dimensions[0], dimensions[1], 1);
                imageData.setSpacing(spacing);
                imageData.setDirection(direction);
                imageData.setOrigin(origin);
                imageData.getPointData().setScalars(scalarArray as any);

                // imageActor
                //   .getMapper()
                //   .getInputData()
                //   .getPointData()
                //   .setScalars(scalarArray as any);
                imageActor.getMapper().setInputData(imageData);
                imageActor.modified();
                imageActor.getMapper().modified();
                imageActor.getMapper().getInputData().modified();
                imageActor.getMapper().getInputData().getPointData().modified();

                // utilities.updateVTKImageDataWithCornerstoneImage(
                //   imageData,
                //   derivedImage
                // );
                viewport.render();
                imageData.modified();
                viewport.resetCamera();
                return;
              },
            },
          ],
          true,
          false
        );

        getAllToolGroups().forEach((toolGroup) => {
          triggerSegmentationRender(toolGroup.id);
        });

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
          _stackImageChangeEventListener as EventListener
        );
      }
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
