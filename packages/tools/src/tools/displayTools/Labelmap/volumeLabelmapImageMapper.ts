import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
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
  createSliceImageData,
  getSliceRenderingCamera,
  getSliceState,
  type SliceRenderingViewport,
} from './volumeLabelmapSliceData';

const OVERLAY_RENDERER_SUFFIX = 'labelmap-image-mapper-overlay';

type PlanarSliceRenderingViewport = SliceRenderingViewport & {
  addImages: (
    stackInputs: Array<{
      imageId: string;
      imageData?: vtkImageData;
      referencedId?: string;
      representationUID?: string;
      useWorldCoordinateImageData?: boolean;
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
    compatibilityViewport.type === Enums.ViewportType.PLANAR_NEXT &&
    typeof compatibilityViewport.addImages === 'function' &&
    typeof compatibilityViewport.getCurrentImageId === 'function' &&
    typeof compatibilityViewport.render === 'function'
  );
}

function createActorEntry(args: {
  imageData: vtkImageData;
  referencedId: string;
  representationUID: string;
}): Types.ActorEntry {
  const mapper = vtkImageMapper.newInstance();
  mapper.setInputData(args.imageData);
  const actor = vtkImageSlice.newInstance();
  actor.setMapper(mapper);

  return {
    uid: args.representationUID,
    actor,
    actorMapper: {
      actor,
      mapper,
      renderMode: ActorRenderMode.VTK_IMAGE,
    },
    referencedId: args.referencedId,
    representationUID: args.representationUID,
  };
}

function getOverlayRendererId(viewportId: string): string {
  return `${viewportId}::${OVERLAY_RENDERER_SUFFIX}`;
}

function getOrCreateOverlayRenderer(viewport: Types.IVolumeViewport) {
  const renderingEngine = viewport.getRenderingEngine();
  const offscreenMultiRenderWindow =
    renderingEngine.getOffscreenMultiRenderWindow(viewport.id);
  const overlayRendererId = getOverlayRendererId(viewport.id);
  const baseRenderer = viewport.getRenderer();
  const baseViewport = baseRenderer.getViewport() as unknown as [
    number,
    number,
    number,
    number,
  ];

  let overlayRenderer =
    offscreenMultiRenderWindow.getRenderer(overlayRendererId);

  if (!overlayRenderer) {
    const renderWindow = offscreenMultiRenderWindow.getRenderWindow();

    if (renderWindow.getNumberOfLayers() < 2) {
      renderWindow.setNumberOfLayers(2);
    }

    offscreenMultiRenderWindow.addRenderer({
      viewport: baseViewport,
      id: overlayRendererId,
      background: [0, 0, 0],
    });

    overlayRenderer = offscreenMultiRenderWindow.getRenderer(overlayRendererId);
    overlayRenderer.setLayer(1);
    overlayRenderer.setPreserveDepthBuffer(false);
  }

  overlayRenderer.setActiveCamera(baseRenderer.getActiveCamera());
  overlayRenderer.setViewport(
    baseViewport[0],
    baseViewport[1],
    baseViewport[2],
    baseViewport[3]
  );

  return overlayRenderer;
}

function moveActorToOverlayRenderer(
  viewport: Types.IVolumeViewport,
  actorEntry: Types.ActorEntry
): void {
  const baseRenderer = viewport.getRenderer();
  const overlayRenderer = getOrCreateOverlayRenderer(viewport);

  baseRenderer.removeActor(actorEntry.actor as vtkImageSlice);
  overlayRenderer.addActor(actorEntry.actor as vtkImageSlice);
}

export function getVolumeLabelmapImageMapperRepresentationUIDs(
  viewport: Types.IViewport,
  segmentationId: string,
  segmentation: Segmentation
): string[] {
  if (!canRenderVolumeViewportLabelmapAsImage(viewport)) {
    return [];
  }

  const useStablePlanarUID = isPlanarSliceRenderingViewport(viewport);

  return getLabelmaps(segmentation)
    .map((layer) => {
      const volume = getOrCreateLabelmapVolume(layer);
      if (!volume) {
        return;
      }

      const state = getSliceState(viewport as SliceRenderingViewport, volume);
      if (!state) {
        return;
      }

      return createLabelmapRepresentationUID({
        segmentationId,
        referencedId: layer.labelmapId,
        ...(useStablePlanarUID ? {} : { sliceStateKey: state.key }),
      });
    })
    .filter((value): value is string => !!value);
}

export async function addVolumeLabelmapImageMapperActors(args: {
  viewport: Types.IViewport;
  segmentation: Segmentation;
  segmentationId: string;
}): Promise<void> {
  const { viewport, segmentation, segmentationId } = args;

  if (!canRenderVolumeViewportLabelmapAsImage(viewport)) {
    return;
  }

  if (isPlanarSliceRenderingViewport(viewport)) {
    await addPlanarLabelmapImageMapperActors({
      viewport,
      segmentation,
      segmentationId,
    });
    return;
  }

  getLabelmaps(segmentation).forEach((layer) => {
    const volume = getOrCreateLabelmapVolume(layer);
    if (!volume) {
      return;
    }

    const sliceData = createSliceImageData(volume, viewport);
    if (!sliceData) {
      return;
    }

    const representationUID = createLabelmapRepresentationUID({
      segmentationId,
      referencedId: layer.labelmapId,
      sliceStateKey: sliceData.state.key,
    });
    const actorEntry = createActorEntry({
      imageData: sliceData.imageData,
      referencedId: layer.labelmapId,
      representationUID,
    });

    (viewport as Types.IVolumeViewport).addActor(actorEntry);
    moveActorToOverlayRenderer(viewport as Types.IVolumeViewport, actorEntry);
  });
}

export function updateVolumeLabelmapImageMapperActors(args: {
  viewport: Types.IViewport;
  segmentation: Segmentation;
  segmentationId: string;
  actorEntries?: Types.ActorEntry[];
}): void {
  const { viewport, segmentation, segmentationId, actorEntries } = args;

  if (!canRenderVolumeViewportLabelmapAsImage(viewport)) {
    return;
  }

  if (isPlanarSliceRenderingViewport(viewport)) {
    updatePlanarLabelmapImageMapperActors({
      viewport,
      segmentation,
      segmentationId,
      actorEntries,
    });
    return;
  }

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

  getLabelmaps(segmentation).forEach((layer) => {
    const actorEntry = actorEntriesByLabelmapId.get(layer.labelmapId);

    if (!actorEntry) {
      return;
    }

    const volume = getOrCreateLabelmapVolume(layer);

    if (!volume) {
      return;
    }

    const sliceData = createSliceImageData(volume, viewport);

    if (!sliceData) {
      return;
    }

    const mapper = actorEntry.actor.getMapper() as vtkImageMapper;
    mapper.setInputData(sliceData.imageData);
    mapper.modified();
    actorEntry.actor.modified?.();
  });
}

export function removeVolumeLabelmapImageMapperActors(
  viewport: Types.IViewport,
  segmentationId: string
): void {
  if (!(viewport.type === Enums.ViewportType.ORTHOGRAPHIC)) {
    return;
  }

  if (!canRenderVolumeViewportLabelmapAsImage(viewport)) {
    return;
  }

  const renderingEngine = viewport.getRenderingEngine();
  const offscreenMultiRenderWindow =
    renderingEngine.getOffscreenMultiRenderWindow(viewport.id);
  const overlayRenderer = offscreenMultiRenderWindow.getRenderer(
    getOverlayRendererId(viewport.id)
  );

  if (!overlayRenderer) {
    return;
  }

  viewport
    .getActors()
    .filter((actorEntry) =>
      isLabelmapRepresentationUID(actorEntry.representationUID, segmentationId)
    )
    .forEach((actorEntry) => {
      overlayRenderer.removeActor(actorEntry.actor as vtkImageSlice);
    });

  if (!overlayRenderer.getActors().length) {
    offscreenMultiRenderWindow.removeRenderer(
      getOverlayRendererId(viewport.id)
    );
  }
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
}): Promise<void> {
  const { viewport, segmentation, segmentationId } = args;

  for (const [index, layer] of getLabelmaps(segmentation).entries()) {
    const volume = getOrCreateLabelmapVolume(layer);

    if (!volume) {
      continue;
    }

    const sliceData = createSliceImageData(volume, viewport);

    if (!sliceData) {
      continue;
    }

    const currentImageId =
      viewport.getCurrentImageId() ??
      volume.imageIds[
        Math.min(
          Math.max(sliceData.state.sliceIndex, 0),
          Math.max(volume.imageIds.length - 1, 0)
        )
      ];

    if (!currentImageId) {
      continue;
    }

    await viewport.addImages([
      {
        imageId: currentImageId,
        imageData: sliceData.imageData,
        referencedId: layer.labelmapId,
        representationUID: createLabelmapRepresentationUID({
          segmentationId,
          referencedId: layer.labelmapId,
        }),
        useWorldCoordinateImageData: true,
        callback: ({ imageActor }) => {
          const mapper = imageActor.getMapper() as vtkImageMapper;
          const camera = getSliceRenderingCamera(viewport);

          mapper.setInputData(sliceData.imageData);
          mapper.modified();
          if (camera) {
            applyPlanarOverlayDepthOffset(
              imageActor,
              camera.viewPlaneNormal,
              index + 1
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
}): void {
  const { viewport, segmentation, segmentationId, actorEntries } = args;
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

  getLabelmaps(segmentation).forEach((layer, index) => {
    const actorEntry = actorEntriesByLabelmapId.get(layer.labelmapId);

    if (!actorEntry) {
      return;
    }

    const volume = getOrCreateLabelmapVolume(layer);

    if (!volume) {
      return;
    }

    const sliceData = createSliceImageData(volume, viewport);

    if (!sliceData) {
      return;
    }

    const mapper = actorEntry.actor.getMapper() as vtkImageMapper;

    mapper.setInputData(sliceData.imageData);
    mapper.modified();
    const camera = getSliceRenderingCamera(viewport);

    if (camera) {
      applyPlanarOverlayDepthOffset(
        actorEntry.actor as vtkImageSlice,
        camera.viewPlaneNormal,
        index + 1
      );
    }
    actorEntry.actor.modified?.();
  });
}
