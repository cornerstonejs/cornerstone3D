import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { loadAndCacheImage } from '../../../loaders/imageLoader';
import { Events, InterpolationType, VOILUTFunctionType } from '../../../enums';
import { ActorRenderMode } from '../../../types';
import type { ActorEntry, IImageVolume, Point3 } from '../../../types';
import { coreLog } from '../../../utilities/logger';
import uuidv4 from '../../../utilities/uuidv4';
import { applyPlanarImagePresentation } from '../../helpers/planarImageRendering';
import { subscribeToVolumeEvents } from '../../helpers/volumeStrategyLifecycle';
import { isVolumeLoading, readBoundQuality } from '../renderingFidelity';
import type {
  LoadedData,
  MountedRendering,
  RenderPathAttachment,
} from '../ViewportArchitectureTypes';
import type {
  PlanarDataPresentation,
  PlanarPayload,
  PlanarVtkVolumeAdapterContext,
} from './PlanarViewportTypes';
import type {
  PlanarImageMapperRendering,
  PlanarVolumeSliceRendering,
} from './planarRuntimeTypes';
import { applyPlanarICameraToActor } from './planarRenderCamera';
import { getPlanarRenderPathActiveSourceICamera } from './planarRenderPathProjection';
import { resolveSlabThickness } from './planarVolumeSliceBlendMode';
import { alignedVolumeAxis, voxelSliceImageData } from './planarVoxelSlice';
import { VtkImageMapperRenderPath } from './VtkImageMapperRenderPath';

const log = coreLog.getLogger('RenderingEngine', 'planarAcquiredFrames');

/** The rendering of the voxel slice of a non-acquisition plane. */
type VoxelSliceRendering = MountedRendering<{
  renderMode: ActorRenderMode.VTK_IMAGE;
  actorEntryUID: string;
  actor: vtkImageSlice;
  mapper: vtkImageMapper;
}>;

/**
 * The actors that draw acquired frames or voxel slices. The overlay order of
 * a volume slice skips them, so such an actor sits at the depth of its source.
 */
export const acquiredFrameActors = new WeakSet<object>();

/**
 * The volume index of a world point, with the index of `axis` rounded to the
 * nearest voxel slice.
 */
function nearestSliceIndex(
  imageData: IImageVolume['imageData'],
  point: Point3,
  axis = 2
): Point3 {
  const index = imageData.worldToIndex([...point]) as Point3;

  index[axis] = Math.round(index[axis]);

  return index;
}

/**
 * The translation that moves the frame of the nearest voxel slice of `axis`
 * onto the plane of the focal point, so that an overlay at that plane stays in
 * front. Only the actor moves: the frame index, the events and the references
 * keep the nearest frame.
 */
function framePlaneOffset(
  imageVolume: IImageVolume,
  focalPoint: Point3,
  viewPlaneNormal: Point3,
  axis = 2
): Point3 {
  const { imageData } = imageVolume;
  const framePoint = imageData.indexToWorld(
    nearestSliceIndex(imageData, focalPoint, axis)
  );
  const distance =
    (focalPoint[0] - framePoint[0]) * viewPlaneNormal[0] +
    (focalPoint[1] - framePoint[1]) * viewPlaneNormal[1] +
    (focalPoint[2] - framePoint[2]) * viewPlaneNormal[2];

  return [
    distance * viewPlaneNormal[0],
    distance * viewPlaneNormal[1],
    distance * viewPlaneNormal[2],
  ];
}

/**
 * The index in `imageIds` of the acquired frame nearest to a world point.
 *
 * The frame is the voxel slice `k = round(worldToIndex(point)[2])` of the
 * full-resolution volume grid. A labelmap that reslices the same grid with
 * nearest sampling rounds in the same way, so the frame and the labelmap stay
 * on one plane, also when the point is between two frames.
 *
 * @returns the index, or `undefined` when the point is outside the volume
 */
export function acquiredFrameIndexOfVolumePoint(
  imageVolume: IImageVolume,
  imageIds: string[],
  point: Point3
): number | undefined {
  const imageData = imageVolume.imageData;

  if (!imageData) {
    return;
  }

  const k = nearestSliceIndex(imageData, point)[2];

  if (!(k >= 0 && k < imageData.getDimensions()[2])) {
    return;
  }

  const imageId = imageVolume.imageIds?.[k];

  if (!imageId || imageIds[k] === imageId) {
    return k < imageIds.length ? k : undefined;
  }

  const imageIdIndex = imageIds.indexOf(imageId);

  return imageIdIndex >= 0 ? imageIdIndex : undefined;
}

/**
 * Adds the full-resolution slices to the volume slice attachment of a source.
 *
 * The binding keeps the volume slice render path for navigation, and keeps two
 * more actors in the renderer while `canDrawAcquiredFrames` holds:
 *
 * - In the acquisition plane, an image path (`VtkImageMapperRenderPath`) draws
 *   the acquired frame of the current plane, after the frame loads.
 * - In the other two planes of the volume axes, a `vtkImageMapper` draws the
 *   voxel slice of the current plane (`voxelSliceImageData`), after the volume
 *   loads. The slice is not thicker than one voxel along the view normal.
 *
 * Otherwise the volume slice actor is visible, for example in an oblique plane.
 *
 * Each full-resolution slice uses the presentation of the volume, with the
 * default VOI of the volume. The hidden renderings are excluded from the
 * fidelity, so the indicator follows the visible path.
 */
export function withAcquiredFrames(
  ctx: PlanarVtkVolumeAdapterContext,
  data: LoadedData<PlanarPayload>,
  volume: RenderPathAttachment<PlanarDataPresentation>
): RenderPathAttachment<PlanarDataPresentation> {
  const volumeRendering = volume.rendering as PlanarVolumeSliceRendering;
  const { imageVolume, imageIds } = volumeRendering;
  let frame: RenderPathAttachment<PlanarDataPresentation> | undefined;
  let mounting = false;
  let removed = false;
  let wantedIndex: number | undefined;
  let voxelSlice: { key: string; rendering: VoxelSliceRendering } | undefined;
  let wantedVoxelSlice: { axis: number; key: string } | undefined;
  let voxelSliceStale = false;

  const frameRendering = () =>
    frame?.rendering as PlanarImageMapperRendering | undefined;
  const isSource = () => ctx.viewport.isCurrentDataId(data.id);
  // The image path follows the volume camera, so it never drives the
  // renderer camera or the render mode of the viewport. As an overlay it sends
  // no STACK_NEW_IMAGE: the volume path sends the slice events of a scroll.
  const frameCtx = {
    ...ctx,
    viewport: { ...ctx.viewport, isCurrentDataId: () => false },
    display: {
      ...ctx.display,
      activateRenderMode: () => undefined,
      requestRender: () => {
        updateVisibility();
        ctx.display.requestRender();
      },
    },
  };
  // The volume slice draws a linear VOI and ignores `voiLUTFunction`, so the
  // frame does too. Limit: the frame has no colormap opacity table.
  const framePresentation = (): PlanarDataPresentation => ({
    ...volumeRendering.dataPresentation,
    voiRange:
      volumeRendering.dataPresentation?.voiRange ??
      volumeRendering.defaultVOIRange,
    voiLUTFunction: VOILUTFunctionType.LINEAR,
  });

  function updateVisibility(): void {
    const rendering = frameRendering();
    const showsFrame =
      wantedIndex !== undefined &&
      rendering?.currentImageIdIndex === wantedIndex;
    const showsVoxelSlice =
      wantedVoxelSlice !== undefined &&
      voxelSlice?.key === wantedVoxelSlice.key;
    const showsFullResolution = showsFrame || showsVoxelSlice;
    const visible = volumeRendering.dataPresentation?.visible !== false;

    volumeRendering.actor.setVisibility(visible && !showsFullResolution);

    if (!volumeRendering.isSegmentationOverlay) {
      // A hidden volume ignores its data events; read the record again.
      volumeRendering.fidelityStale ||=
        !showsFullResolution && volumeRendering.showsAcquiredFrame;
      volumeRendering.excludeFromFidelity = showsFullResolution;
    }

    volumeRendering.showsAcquiredFrame = showsFullResolution;

    const camera = getPlanarRenderPathActiveSourceICamera(ctx);
    const place = (
      shown: VoxelSliceRendering | PlanarImageMapperRendering,
      shows: boolean,
      axis: number
    ) => {
      shown.actor.setVisibility(visible && shows);
      shown.excludeFromFidelity = !shows;
      applyPlanarICameraToActor({
        actor: shown.actor,
        activeSourceICamera: camera,
      });

      if (shows && camera) {
        shown.actor.setPosition(
          ...framePlaneOffset(
            imageVolume,
            camera.focalPoint,
            camera.viewPlaneNormal,
            axis
          )
        );
      }
    };

    if (voxelSlice) {
      place(voxelSlice.rendering, showsVoxelSlice, wantedVoxelSlice?.axis);
    }

    if (rendering) {
      place(rendering, showsFrame, 2);
    }
  }

  /** Applies the presentation of the volume to the voxel slice. */
  function presentVoxelSlice(): void {
    if (voxelSlice) {
      applyPlanarImagePresentation({
        actor: voxelSlice.rendering.actor,
        props: {
          interpolationType: InterpolationType.LINEAR,
          ...framePresentation(),
        },
      });
    }
  }

  /**
   * The voxel slice of `axis` at the focal point, or `undefined` while the
   * volume loads, for a slab thicker than one voxel of `axis`, or outside the
   * volume.
   */
  function voxelSliceOf(axis: number, focalPoint: Point3) {
    const slabThickness = resolveSlabThickness(
      volumeRendering.dataPresentation?.slabThickness
    );

    if (
      imageVolume.loadStatus?.loaded === false ||
      isVolumeLoading(imageVolume) ||
      slabThickness > imageVolume.spacing[axis]
    ) {
      return;
    }

    const sliceIndex = nearestSliceIndex(
      imageVolume.imageData,
      focalPoint,
      axis
    )[axis];

    return sliceIndex >= 0 && sliceIndex < imageVolume.dimensions[axis]
      ? { axis, sliceIndex, key: `${axis}:${sliceIndex}` }
      : undefined;
  }

  function drawVoxelSlice(axis: number, sliceIndex: number, key: string) {
    if (voxelSlice?.key === key && !voxelSliceStale) {
      return;
    }

    const imageData = voxelSliceImageData(
      imageVolume,
      axis,
      sliceIndex,
      voxelSlice?.rendering.mapper.getInputData()
    );

    if (!imageData) {
      wantedVoxelSlice = undefined;
      return;
    }

    if (!voxelSlice) {
      const mapper = vtkImageMapper.newInstance();
      const actor = vtkImageSlice.newInstance();
      const rendering: VoxelSliceRendering = {
        renderMode: ActorRenderMode.VTK_IMAGE,
        actorEntryUID: uuidv4(),
        actor,
        mapper,
        sampleDistanceLod: 1,
        excludeFromFidelity: true,
        // The slice reads the full-resolution voxels of the volume.
        refreshFidelity: () => {
          rendering.voxelQuality = readBoundQuality(imageVolume, undefined);
          rendering.fullGrid = imageVolume.voxelGrid;
          rendering.qualityPending = isVolumeLoading(imageVolume);
        },
      };

      actor.setMapper(mapper);
      ctx.vtk.renderer.addActor(actor);
      acquiredFrameActors.add(actor);
      voxelSlice = { key, rendering };
      presentVoxelSlice();
    }

    if (voxelSlice.rendering.mapper.getInputData() !== imageData) {
      voxelSlice.rendering.mapper.setInputData(imageData);
    }

    voxelSlice.key = key;
    voxelSliceStale = false;
  }

  async function mountFrame(imageIdIndex: number): Promise<void> {
    mounting = true;

    try {
      const image = await loadAndCacheImage(imageIds[imageIdIndex]);
      const attachment = await new VtkImageMapperRenderPath().addData(
        frameCtx,
        {
          ...data,
          image,
          imageData: undefined,
          initialImageIdIndex: imageIdIndex,
        } as LoadedData,
        { renderMode: ActorRenderMode.VTK_IMAGE, role: 'overlay' }
      );

      if (removed) {
        attachment.removeData();
        return;
      }

      frame = attachment;
      acquiredFrameActors.add(frameRendering().actor);
      frame.updateDataPresentation(framePresentation());
    } catch (error) {
      log.warn('The acquired frame did not load', error);
      return;
    } finally {
      mounting = false;
    }

    sync();
    ctx.display.requestRender();
  }

  function sync(): void {
    if (removed) {
      return;
    }

    const camera = getPlanarRenderPathActiveSourceICamera(ctx);
    const axis =
      camera && isSource() && ctx.viewport.canDrawAcquiredFrames?.(data.id)
        ? alignedVolumeAxis(imageVolume, camera.viewPlaneNormal)
        : undefined;

    wantedIndex =
      axis === 2
        ? acquiredFrameIndexOfVolumePoint(
            imageVolume,
            imageIds,
            camera.focalPoint
          )
        : undefined;

    const voxel =
      axis === 0 || axis === 1
        ? voxelSliceOf(axis, camera.focalPoint)
        : undefined;

    wantedVoxelSlice = voxel;

    if (voxel) {
      drawVoxelSlice(voxel.axis, voxel.sliceIndex, voxel.key);
    }

    if (wantedIndex !== undefined) {
      if (frame) {
        frame.applyViewState({
          ...ctx.viewport.getViewState(),
          slice: { kind: 'stackIndex', imageIdIndex: wantedIndex },
        });
      } else if (!mounting) {
        void mountFrame(wantedIndex);
      }
    }

    updateVisibility();
  }

  // A completed load, or an edit of the voxels after it, changes the voxel
  // slice. The reduced slice shows during the load, so its events do nothing.
  const removeVolumeSubscription = subscribeToVolumeEvents(
    data.volumeId,
    (eventType) => {
      if (isVolumeLoading(imageVolume)) {
        return;
      }

      voxelSliceStale ||= eventType === Events.IMAGE_VOLUME_MODIFIED;
      sync();
    }
  );

  const fullResolutionActorEntry = (
    rendering: VoxelSliceRendering | PlanarImageMapperRendering | undefined
  ): ActorEntry | undefined =>
    // No referencedId: a measurement tool must not see a second target.
    rendering && {
      uid: rendering.actorEntryUID,
      actor: rendering.actor,
      actorMapper: {
        actor: rendering.actor,
        mapper: rendering.mapper,
        renderMode: ActorRenderMode.VTK_IMAGE,
      } as ActorEntry['actorMapper'],
    };

  return {
    ...volume,
    updateDataPresentation: (props) => {
      volume.updateDataPresentation(props);
      frame?.updateDataPresentation(framePresentation());
      presentVoxelSlice();
      sync();
    },
    applyViewState: (viewState) => {
      volume.applyViewState(viewState);
      sync();
    },
    resize: () => {
      volume.resize?.();
      sync();
    },
    getActorEntries: (loadedData) =>
      [
        volume.getActorEntry?.(loadedData),
        fullResolutionActorEntry(frameRendering()),
        fullResolutionActorEntry(voxelSlice?.rendering),
      ].filter(Boolean),
    getRenderings: () =>
      [volume.rendering, frame?.rendering, voxelSlice?.rendering].filter(
        Boolean
      ),
    removeData: () => {
      removed = true;
      removeVolumeSubscription();
      frame?.removeData();

      if (voxelSlice) {
        ctx.vtk.renderer.removeActor(voxelSlice.rendering.actor);
      }

      volume.removeData();
    },
  };
}
