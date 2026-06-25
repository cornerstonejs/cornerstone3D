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
import removeLabelmapRepresentationData from './removeLabelmapRepresentationData';

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
  const staleActorEntries = labelmapActorEntries.filter(
    (actorEntry) => !derivedImageIdSet.has(actorEntry.referencedId)
  );

  let shouldTriggerSegmentationRender = false;
  let shouldRenderViewport = false;

  // The legacy StackViewport renders directly from each actor's vtkImageData
  // and does not track labelmap actors through the generic-viewport data
  // registry. On scroll we can therefore swap an existing actor's underlying
  // labelmap image in place instead of destroying it and allocating a fresh
  // vtkImageData + TypedArray for every slice. The destroy/recreate path leaks
  // because vtk.js internal caches retain the discarded objects, growing the
  // heap linearly while scrolling. Registry-backed viewports (PlanarViewport
  // and its legacy adapter) own their actors by dataId, so we keep their
  // existing remove/recreate flow to avoid desyncing that state.
  const canReuseActorsInPlace =
    typeof (viewport as { removeData?: unknown }).removeData !== 'function';

  const removeStaleActorEntries = (actorEntries: Types.ActorEntry[]) => {
    if (!actorEntries.length) {
      return;
    }

    const legacyActorEntryUIDs: string[] = [];

    actorEntries.forEach((actorEntry) => {
      if (
        removeLabelmapRepresentationData(viewport, segmentationId, actorEntry)
      ) {
        return;
      }

      legacyActorEntryUIDs.push(actorEntry.uid);
    });

    if (legacyActorEntryUIDs.length) {
      viewport.removeActors(legacyActorEntryUIDs);
    }

    shouldTriggerSegmentationRender = true;
    shouldRenderViewport = true;
  };

  // Actors eligible to be reused in place for a new slice's labelmap. Each is
  // consumed at most once so overlapping segments (multiple labelmap groups on
  // the same slice) cannot steal one another's actor.
  const reusableActorEntries = canReuseActorsInPlace
    ? [...staleActorEntries]
    : [];

  if (!canReuseActorsInPlace) {
    removeStaleActorEntries(staleActorEntries);
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
      // Reuse a stale actor in place when supported, so scrolling does not
      // churn vtk.js objects. shift() consumes the actor so two derived images
      // (overlapping segment groups) never resolve to the same actor.
      const reusableActorEntry = reusableActorEntries.shift();

      if (reusableActorEntry) {
        const reusableActorMapper = reusableActorEntry.actorMapper as
          | {
              mapper?: {
                getInputData: () => unknown;
              };
            }
          | undefined;
        const reusableMapper = reusableActorMapper?.mapper
          ? reusableActorMapper.mapper
          : reusableActorEntry.actor.getMapper();
        const reusableImageData = reusableMapper.getInputData();

        // Floating-point drift between slices means the segmentation origin can
        // differ slightly from the current image; realign it so the labelmap
        // renders at the correct location after reuse.
        if (typeof reusableImageData.setOrigin === 'function') {
          reusableImageData.setOrigin(currentOrigin);
        }

        reusableImageData.modified();

        if (reusableImageData.setDerivedImage) {
          reusableImageData.setDerivedImage(derivedImage);
        } else {
          utilities.updateVTKImageDataWithCornerstoneImage(
            reusableImageData,
            derivedImage
          );
        }

        reusableActorEntry.referencedId = derivedImageId;
        reusableActorEntry.representationUID = createLabelmapRepresentationUID({
          segmentationId,
          referencedId: derivedImage.imageId,
        });

        shouldTriggerSegmentationRender = true;
        shouldRenderViewport = true;
        return;
      }

      const representationUID = createLabelmapRepresentationUID({
        segmentationId,
        referencedId: derivedImage.imageId,
      });

      if (
        renderMode === 'image' &&
        defaultActorRenderMode === ActorRenderMode.CPU_IMAGE
      ) {
        viewport.addImages([
          {
            dataId: representationUID,
            imageId: derivedImageId,
            reference: {
              kind: 'segmentation',
              segmentationId,
              representationUID,
              labelmapId: derivedImage.imageId,
            },
            representationUID,
          },
        ]);
      } else {
        const { dimensions, spacing, direction } =
          viewport.getImageDataMetadata(derivedImage);
        const constructor = derivedImage.voxelManager.getConstructor();
        const newPixelData = derivedImage.voxelManager.getScalarData();
        // @ts-expect-error vtk.js accepts typed array constructors here.
        const values = new constructor(newPixelData);
        const scalarArray = vtkDataArray.newInstance({
          dataType: vtkDataArray.getDataType(values as never),
          name: 'Pixels',
          numberOfComponents: 1,
          values,
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
            dataId: representationUID,
            imageId: derivedImageId,
            reference: {
              kind: 'segmentation',
              segmentationId,
              representationUID,
              labelmapId: derivedImage.imageId,
            },
            representationUID,
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

  // Any reusable actors left over (the new slice has fewer labelmap groups than
  // the previous one) are genuinely stale and must be removed.
  removeStaleActorEntries(reusableActorEntries);

  if (shouldTriggerSegmentationRender) {
    triggerSegmentationRender(viewport.id);
  }

  if (shouldRenderViewport) {
    viewport.render();
  }
}
