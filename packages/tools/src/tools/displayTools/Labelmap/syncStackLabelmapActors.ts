import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import {
  ActorRenderMode,
  cache,
  utilities,
  type Types,
} from '@cornerstonejs/core';
import { triggerSegmentationRender } from '../../../stateManagement/segmentation/SegmentationRenderingEngine';
import { updateLabelmapSegmentationImageReferences } from '../../../stateManagement/segmentation/updateLabelmapSegmentationImageReferences';
import { getCurrentLabelmapImageIdsForViewport } from '../../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';
import { getLabelmapActorEntries } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';
import getViewportLabelmapRenderMode from '../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import { createLabelmapRepresentationUID } from './labelmapRepresentationUID';

export function syncStackLabelmapActors(
  viewport: Types.IStackViewport,
  segmentationId: string
): void {
  if (
    typeof (viewport as { getCurrentImageId?: () => string })
      .getCurrentImageId !== 'function'
  ) {
    return;
  }

  const currentImageId = viewport.getCurrentImageId();

  if (!currentImageId) {
    return;
  }

  updateLabelmapSegmentationImageReferences(viewport.id, segmentationId);

  const derivedImageIds =
    getCurrentLabelmapImageIdsForViewport(viewport.id, segmentationId) ?? [];
  const derivedImageIdSet = new Set(derivedImageIds);
  const labelmapActorEntries =
    getLabelmapActorEntries(viewport.id, segmentationId) ?? [];
  const staleActorUIDs = labelmapActorEntries
    .filter((actorEntry) => !derivedImageIdSet.has(actorEntry.referencedId))
    .map((actorEntry) => actorEntry.uid);

  let shouldTriggerSegmentationRender = false;
  let shouldRenderViewport = staleActorUIDs.length > 0;

  if (staleActorUIDs.length) {
    viewport.removeActors(staleActorUIDs);
    shouldTriggerSegmentationRender = true;
  }

  const renderMode = getViewportLabelmapRenderMode(viewport);
  const defaultActorRenderMode = viewport.getDefaultActor()?.actorMapper
    ?.renderMode as Types.ActorRenderMode | undefined;
  const currentImage =
    cache.getImage(currentImageId) ||
    ({
      imageId: currentImageId,
    } as Types.IImage);
  const { origin: currentOrigin } = viewport.getImageDataMetadata(currentImage);

  derivedImageIds.forEach((derivedImageId) => {
    const derivedImage = cache.getImage(derivedImageId);

    if (!derivedImage) {
      console.warn(
        'No derived image found in the cache for segmentation representation',
        { segmentationId, derivedImageId }
      );
      return;
    }

    const segmentationActorEntry = getLabelmapActorEntries(
      viewport.id,
      segmentationId
    )?.find((actorEntry) => actorEntry.referencedId === derivedImageId);

    if (!segmentationActorEntry) {
      if (
        renderMode === 'image' &&
        defaultActorRenderMode === ActorRenderMode.CPU_IMAGE
      ) {
        viewport.addImages([
          {
            imageId: derivedImageId,
            representationUID: createLabelmapRepresentationUID({
              segmentationId,
              referencedId: derivedImage.imageId,
            }),
          },
        ]);
      } else {
        const { dimensions, spacing, direction } =
          viewport.getImageDataMetadata(derivedImage);
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
        imageData.setOrigin(currentOrigin);
        imageData.getPointData().setScalars(scalarArray);
        imageData.modified();

        viewport.addImages([
          {
            imageId: derivedImageId,
            representationUID: createLabelmapRepresentationUID({
              segmentationId,
              referencedId: derivedImage.imageId,
            }),
            callback: ({ imageActor }) => {
              imageActor.getMapper().setInputData(imageData);
            },
          },
        ]);
      }

      shouldTriggerSegmentationRender = true;
      shouldRenderViewport = true;
      return;
    }

    const actorMapper = segmentationActorEntry.actorMapper as
      | {
          mapper?: {
            getInputData: () => unknown;
          };
        }
      | undefined;
    const mapper = actorMapper?.mapper
      ? actorMapper.mapper
      : segmentationActorEntry.actor.getMapper();
    const segmentationImageData = mapper.getInputData();

    segmentationImageData.modified();

    if (segmentationImageData.setDerivedImage) {
      segmentationImageData.setDerivedImage(derivedImage);
    } else {
      utilities.updateVTKImageDataWithCornerstoneImage(
        segmentationImageData,
        derivedImage
      );
    }

    shouldRenderViewport = true;
  });

  if (shouldTriggerSegmentationRender) {
    triggerSegmentationRender(viewport.id);
  }

  if (shouldRenderViewport) {
    viewport.render();
  }
}
