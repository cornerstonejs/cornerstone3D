import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { ActorRenderMode, Enums, type Types } from '@cornerstonejs/core';
import type { Segmentation } from '../../../types/SegmentationStateTypes';
import { canRenderVolumeViewportLabelmapAsImage } from '../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport';
import {
  getLabelmap,
  getOrCreateLabelmapVolume,
  getLabelmaps,
  getLabelmapForImageId,
  getLabelmapForVolumeId,
} from '../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import {
  createLabelmapRepresentationUID,
  isLabelmapRepresentationUID,
} from './labelmapRepresentationUID';
import {
  applyPlanarOverlayDepthOffset,
  getSliceRenderingCamera,
  getSliceState,
  type SliceRenderingViewport,
} from './volumeLabelmapSliceData';
import {
  canCreateResampledSliceImageData,
  createPlanarSliceImageData,
} from './volumeLabelmapResampledSliceData';

type SegmentationReference = {
  kind: 'segmentation';
  segmentationId: string;
  representationUID: string;
  labelmapId: string;
};

type PlanarSliceRenderingViewport = SliceRenderingViewport & {
  getActors: () => Types.ActorEntry[];
  addImages: (
    stackInputs: Array<{
      displaySetId?: string;
      imageId: string;
      imageData?: vtkImageData;
      reference?: SegmentationReference;
      useWorldCoordinateImageData?: boolean;
      excludeFromFidelity?: boolean;
      callback?: (args: { imageActor: vtkImageSlice }) => void;
    }>
  ) => void | Promise<void>;
  getCurrentImageId: () => string | undefined;
  render: () => void;
  type: string;
};

function isPlanarSliceRenderingViewport(
  viewport: Types.IViewport
): viewport is PlanarSliceRenderingViewport {
  const compatibilityViewport =
    viewport as Partial<PlanarSliceRenderingViewport>;

  return (
    compatibilityViewport.type === Enums.ViewportType.PLANAR &&
    typeof compatibilityViewport.addImages === 'function' &&
    typeof compatibilityViewport.getCurrentImageId === 'function' &&
    typeof compatibilityViewport.render === 'function'
  );
}

/**
 * Sets whether a labelmap slice mapper draws the label outline at the edges of
 * its image, which are faces of the labelmap volume. The OpenGL image mapper
 * of core reads the field `labelOutlineAtImageEdges`. The mapper is marked
 * modified only when the value changes, since a change builds a new shader.
 */
function setLabelOutlineAtImageEdges(
  mapper: vtkImageMapper,
  enabled: boolean
): void {
  if (mapper.set?.({ labelOutlineAtImageEdges: enabled }, true)) {
    mapper.modified();
  }
}

export function getVolumeLabelmapImageMapperRepresentationUIDs(
  viewport: Types.IViewport,
  segmentationId: string,
  segmentation: Segmentation
): string[] {
  if (
    !canRenderVolumeViewportLabelmapAsImage(viewport) ||
    !isPlanarSliceRenderingViewport(viewport)
  ) {
    return [];
  }

  const camera = getSliceRenderingCamera(viewport);

  return getLabelmaps(segmentation)
    .map((layer) => {
      const volume = getOrCreateLabelmapVolume(layer);
      if (!volume) {
        return;
      }

      const state = getSliceState(viewport, volume, camera);
      const canShowSlice =
        !!state || canCreateResampledSliceImageData(volume, viewport, camera);

      return canShowSlice
        ? createLabelmapRepresentationUID({
            segmentationId,
            referencedId: layer.labelmapId,
          })
        : undefined;
    })
    .filter((value): value is string => !!value);
}

export async function addVolumeLabelmapImageMapperActors(args: {
  viewport: Types.IViewport;
  segmentation: Segmentation;
  segmentationId: string;
  outlineAtImageEdges?: boolean;
}): Promise<void> {
  const { viewport, segmentation, segmentationId, outlineAtImageEdges } = args;

  if (
    !canRenderVolumeViewportLabelmapAsImage(viewport) ||
    !isPlanarSliceRenderingViewport(viewport)
  ) {
    return;
  }

  await addPlanarLabelmapImageMapperActors({
    viewport,
    segmentation,
    segmentationId,
    outlineAtImageEdges,
  });
}

export function updateVolumeLabelmapImageMapperActors(args: {
  viewport: Types.IViewport;
  segmentation: Segmentation;
  segmentationId: string;
  actorEntries?: Types.ActorEntry[];
  outlineAtImageEdges?: boolean;
}): void {
  const {
    viewport,
    segmentation,
    segmentationId,
    actorEntries,
    outlineAtImageEdges,
  } = args;

  if (
    !canRenderVolumeViewportLabelmapAsImage(viewport) ||
    !isPlanarSliceRenderingViewport(viewport)
  ) {
    return;
  }

  updatePlanarLabelmapImageMapperActors({
    viewport,
    segmentation,
    segmentationId,
    actorEntries,
    outlineAtImageEdges,
  });
}

export function getLabelmapForActorReference(
  segmentation: Segmentation,
  referencedId?: string
) {
  if (!referencedId) {
    return;
  }

  return (
    getLabelmap(segmentation, referencedId) ??
    getLabelmapForImageId(segmentation, referencedId) ??
    getLabelmapForVolumeId(segmentation, referencedId) ??
    getLabelmaps(segmentation).find((layer) => layer.volumeId === referencedId)
  );
}

async function addPlanarLabelmapImageMapperActors(args: {
  viewport: PlanarSliceRenderingViewport;
  segmentation: Segmentation;
  segmentationId: string;
  outlineAtImageEdges?: boolean;
}): Promise<void> {
  const { viewport, segmentation, segmentationId, outlineAtImageEdges } = args;
  const camera = getSliceRenderingCamera(viewport);

  for (const layer of getLabelmaps(segmentation)) {
    const volume = getOrCreateLabelmapVolume(layer);

    if (!volume) {
      continue;
    }

    const sliceData = createPlanarSliceImageData(volume, viewport, camera);

    if (!sliceData) {
      continue;
    }

    const currentImageId =
      viewport.getCurrentImageId() ??
      volume.imageIds[
        Math.min(
          Math.max(sliceData.sliceIndex, 0),
          Math.max(volume.imageIds.length - 1, 0)
        )
      ];

    if (!currentImageId) {
      continue;
    }

    const representationUID = createLabelmapRepresentationUID({
      segmentationId,
      referencedId: layer.labelmapId,
    });

    await viewport.addImages([
      {
        displaySetId: representationUID,
        imageId: currentImageId,
        imageData: sliceData.imageData,
        reference: {
          kind: 'segmentation',
          segmentationId,
          representationUID,
          labelmapId: layer.labelmapId,
        },
        useWorldCoordinateImageData: true,
        // FIDELITY-STATE-9: labelmap overlay actors are out of fidelity scope.
        excludeFromFidelity: true,
        callback: ({ imageActor }) => {
          const mapper = imageActor.getMapper() as vtkImageMapper;

          mapper.setInputData(sliceData.imageData);
          mapper.modified();
          setLabelOutlineAtImageEdges(mapper, !!outlineAtImageEdges);
          if (camera) {
            applyPlanarOverlayDepthOffset(
              imageActor,
              sliceData.imageData,
              camera,
              getPlanarOverlayOrder(viewport, imageActor)
            );
          }
        },
      },
    ]);
  }

  viewport.render();
}

function updatePlanarLabelmapImageMapperActors(args: {
  viewport: PlanarSliceRenderingViewport;
  segmentation: Segmentation;
  segmentationId: string;
  actorEntries?: Types.ActorEntry[];
  outlineAtImageEdges?: boolean;
}): void {
  const {
    viewport,
    segmentation,
    segmentationId,
    actorEntries,
    outlineAtImageEdges,
  } = args;
  const actorEntriesByLabelmapId = new Map(
    (actorEntries ?? viewport.getActors())
      .filter((actorEntry) =>
        isLabelmapRepresentationUID(
          actorEntry.representationUID,
          segmentationId
        )
      )
      .map((actorEntry) => [actorEntry.referencedId, actorEntry] as const)
  );
  const camera = getSliceRenderingCamera(viewport);

  getLabelmaps(segmentation).forEach((layer) => {
    const actorEntry = actorEntriesByLabelmapId.get(layer.labelmapId);

    if (!actorEntry) {
      return;
    }

    const volume = getOrCreateLabelmapVolume(layer);

    if (!volume) {
      return;
    }

    const sliceData = createPlanarSliceImageData(volume, viewport, camera);

    if (!sliceData) {
      return;
    }

    const mapper = actorEntry.actor.getMapper() as vtkImageMapper;

    mapper.setInputData(sliceData.imageData);
    mapper.modified();
    setLabelOutlineAtImageEdges(mapper, !!outlineAtImageEdges);

    if (camera) {
      applyPlanarOverlayDepthOffset(
        actorEntry.actor as vtkImageSlice,
        sliceData.imageData,
        camera,
        getPlanarOverlayOrder(viewport, actorEntry.actor as vtkImageSlice)
      );
    }
    actorEntry.actor.modified?.();
  });
}

/**
 * Puts the labelmap slice actors of a segmentation back on the view plane of
 * a planar viewport, with the slice images that they hold now.
 *
 * A camera move along the view normal moves the view plane at once, and the
 * slice image for the new plane arrives with the next segmentation render.
 * Without this placement in between, the actors stay on the old plane for one
 * frame, where the image hides them when the plane moved toward the camera.
 */
export function placeVolumeLabelmapImageMapperActors(args: {
  viewport: Types.IViewport;
  segmentationId: string;
}): void {
  const { viewport, segmentationId } = args;

  if (
    !isPlanarSliceRenderingViewport(viewport) ||
    !canRenderVolumeViewportLabelmapAsImage(viewport)
  ) {
    return;
  }

  const camera = getSliceRenderingCamera(viewport);

  if (!camera) {
    return;
  }

  viewport
    .getActors()
    .filter(
      (actorEntry) =>
        actorEntry.actorMapper?.renderMode === ActorRenderMode.VTK_IMAGE &&
        isLabelmapRepresentationUID(
          actorEntry.representationUID,
          segmentationId
        )
    )
    .forEach((actorEntry) => {
      const actor = actorEntry.actor as vtkImageSlice;
      const imageData = (actor.getMapper() as vtkImageMapper).getInputData();

      if (!imageData) {
        return;
      }

      applyPlanarOverlayDepthOffset(
        actor,
        imageData,
        camera,
        getPlanarOverlayOrder(viewport, actor)
      );
    });
}

/**
 * Returns the depth order of a labelmap slice actor on a planar viewport. The
 * core gives the image slices that it owns (the source at 0, a fusion layer
 * such as PT by its place among the image slices of the renderer) an order
 * from 0 to one less than the number of image slices. A labelmap slice takes
 * the number of image slices of the viewport plus its own place among them,
 * so it is nearer to the camera than the source and every fusion layer, also
 * after a live render path switch has moved a remounted layer to the end of
 * the renderer, and it shares its depth with no other slice. An actor that
 * the viewport does not hold yet is placed as if it were the last one.
 */
function getPlanarOverlayOrder(
  viewport: PlanarSliceRenderingViewport,
  actor: vtkImageSlice
): number {
  const sliceActors = viewport
    .getActors()
    .map((actorEntry) => actorEntry.actor)
    .filter(
      (viewportActor) => viewportActor?.getClassName?.() === 'vtkImageSlice'
    );
  const order = sliceActors.indexOf(actor);

  return sliceActors.length + (order === -1 ? sliceActors.length : order);
}
