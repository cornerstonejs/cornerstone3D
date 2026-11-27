import { buildPlanarActorEntry } from './buildPlanarActorEntry';
import uuidv4 from '../../../utilities/uuidv4';
import { Events, ViewportType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import { getDefaultVolumeVOIRange } from '../../helpers/setDefaultVolumeVOI';
import * as lifecycle from '../../helpers/volumeStrategyLifecycle';
import { PlanarRenderModeId } from './planarRenderModeIds';
import type { IImageData, IImageVolume, VOIRange } from '../../../types';
import type {
  DataAddOptions,
  LoadedData,
  RenderPathAttachment,
  RenderPathDefinition,
  RenderPath,
} from '../ViewportArchitectureTypes';
import type {
  PlanarViewState,
  PlanarDisplaySetAppearance,
  PlanarPayload,
  PlanarResolvedICamera,
  PlanarViewportRenderContext,
  PlanarVtkVolumeAdapterContext,
} from './PlanarViewportTypes';
import type { PlanarVtkCpuSliceRendering } from './planarRuntimeTypes';
import { triggerPlanarVolumeNewImageOfPlacedSlice } from './planarImageEvents';
import {
  applyPlanarICameraToRenderer,
  fitPlanarCameraClippingRange,
} from './planarRenderCamera';
import {
  getPlanarRenderPathActiveSourceICamera,
  resolvePlanarRenderPathProjection,
} from './planarRenderPathProjection';
import {
  MAX_SCREEN_SLICE_SIZE,
  PlanarSliceSampler,
  getPlanarCpuSliceInputs,
  getVolumeClipPlanes,
} from './planarCpuSlice';
import type { PlanarCpuSlice, PlanarCpuSliceInputs } from './planarCpuSlice';
import {
  getCanvasScreenSliceGeometry,
  getNeighbourCameras,
  recordPlaneMove,
  scheduleCpuSliceRestWork,
} from './planarCpuSliceRest';
import type { PlanarSlicePlaneMoves } from './planarCpuSliceRest';
import { PlanarCpuSliceActor } from './planarCpuSliceActor';
import {
  buildPlanarVolumeImageData,
  getSliceActorDepthOrder,
} from './VtkGpuVolumeSliceRenderPath';
import {
  isSegmentationOverlayData,
  isVolumeLoading,
} from '../renderingFidelity';
import { getRenderingCapabilities } from '../../../utilities/renderingCapabilities';
import { canFilterFloatTextures } from '../../vtkClasses/floatLinearFilter';
import {
  getPlanarDeliveryUpdate,
  getPlanarFrameDeliveryKey,
  getPlanarOverlayFrameState,
} from './planarOverlayFrames';
import type { PlanarOverlayFrameState } from './planarOverlayFrames';
import { resolveSlabThickness } from './planarVolumeSliceBlendMode';
import { createPlanarLoadingUpdates } from './planarLoadingUpdates';

/** The parts of one mounted sampled slice. */
type CpuSliceMount = PlanarSlicePlaneMoves & {
  ctx: PlanarVtkVolumeAdapterContext;
  displaySetId: string;
  rendering: PlanarVtkCpuSliceRendering;
  sampler: PlanarSliceSampler;
  draw: PlanarCpuSliceActor;
  /** The largest width or height of a slice (`getCpuSliceMaxSize`). */
  maxSliceSize: number;
  /** Cancels the pending work at rest: the rest timer or an idle prefetch. */
  cancelRestWork?: () => void;
  /** What the layer may draw of the plane of the last update. */
  overlayFrames?: PlanarOverlayFrameState;
  /**
   * The key of the deliveries of the frames of the plane of the last update
   * (`getPlanarFrameDeliveryKey`), when one is kept.
   */
  deliveryKey?: string;
  /**
   * True while the layer drew nothing at the fit of the clipping range of
   * the camera (a mount or a move before any frame of its plane arrived), so
   * that its first slice fits it (`fitClippingRangeToSlice`).
   */
  fitWhenDrawn?: boolean;
};

/**
 * The render path of `vtkCpuSlice`: a volume-backed display set whose
 * visible slice is cut out of the volume on the CPU and drawn as a 2D image.
 * No 3D texture is made for it.
 *
 * It wires two steps: the sample step (`PlanarSliceSampler`, plain data) and
 * the draw step (`PlanarCpuSliceActor`, the only part that knows vtk.js
 * image classes). Navigation, events, appearance and depth order follow
 * `VtkGpuVolumeSliceRenderPath`.
 *
 * It draws one value per voxel, so it refuses a volume of several components
 * per voxel (a colour volume), which the render path decision never sends
 * here.
 *
 * It has no acquired frames (`withAcquiredFrames`): the volume path shows them
 * in place of a reduced texture, and this path samples the full-resolution
 * voxels, so every plane, the acquisition plane too, is already exact.
 *
 * @internal
 */
export class VtkCpuSliceRenderPath
  implements RenderPath<PlanarVtkVolumeAdapterContext>
{
  async addData(
    ctx: PlanarVtkVolumeAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<PlanarDisplaySetAppearance>> {
    const payload: PlanarPayload = data as unknown as LoadedData<PlanarPayload>;
    const imageVolume = payload.imageVolume;
    const isSegmentationOverlay = isSegmentationOverlayData(payload, options);

    if (!imageVolume) {
      throw new Error(
        '[PlanarViewport] Volume rendering requires a prepared image volume'
      );
    }

    if ((imageVolume.voxelManager?.numberOfComponents ?? 1) > 1) {
      throw new Error(
        '[PlanarViewport] vtkCpuSlice draws one value per voxel; a volume of several components per voxel needs another render mode'
      );
    }

    const defaultVOIRange = await getCpuSliceDefaultVOIRange(imageVolume);
    const draw = new PlanarCpuSliceActor({
      voxelManager: imageVolume.voxelManager,
      viewportId: ctx.viewportId,
    });

    draw.setClipPlanes(getVolumeClipPlanes(imageVolume));
    ctx.display.activateRenderMode(PlanarRenderModeId.VTK_CPU_SLICE);
    ctx.vtk.renderer.addActor(draw.actor);

    const maxSliceSize = getCpuSliceMaxSize();
    const sampler = new PlanarSliceSampler({
      keepFractions: canFilterFloatTextures(),
      maxSliceSize,
      canFilterFloatTextures: () => canFilterFloatTextures(),
      sampleSlabsInSteps: true,
      onlyArrivedFrames: true,
    });
    const rendering: PlanarVtkCpuSliceRendering = {
      renderMode: PlanarRenderModeId.VTK_CPU_SLICE,
      actorEntryUID: uuidv4(),
      actor: draw.actor,
      mapper: draw.mapper,
      overlayOrder: getSliceActorDepthOrder(ctx, data.id, draw.actor),
      imageVolume,
      imageIds: payload.imageIds,
      acquisitionOrientation: payload.acquisitionOrientation,
      currentImageIdIndex: payload.initialImageIdIndex ?? 0,
      maxImageIdIndex: payload.imageIds.length - 1,
      defaultVOIRange,
      appearance: undefined,
      isSegmentationOverlay,
      excludeFromFidelity: isSegmentationOverlay,
      fullGrid: imageVolume.voxelGrid,
      sampleDistanceLod: 1,
      getSliceCacheStatistics: () => sampler.getStatistics(),
    };
    const mount: CpuSliceMount = {
      ctx,
      displaySetId: data.id,
      rendering,
      sampler,
      draw,
      maxSliceSize,
    };

    rendering.refreshFidelity = () =>
      refreshCpuSliceFidelity(rendering, sampler);
    rendering.refreshFidelity();
    rendering.removeStreamingSubscriptions = this.subscribeToVolumeData(
      mount,
      payload.volumeId
    );

    return {
      rendering,
      updateAppearance: (props) => {
        this.updateAppearance(mount, props);
      },
      applyViewState: (camera) => {
        this.applyViewState(mount, camera);
      },
      getFrameOfReferenceUID: () => {
        return rendering.imageVolume.metadata?.FrameOfReferenceUID;
      },
      getActorEntry: (data) => {
        const planarData = data as LoadedData<PlanarPayload>;

        return buildPlanarActorEntry(planarData, {
          actor: rendering.actor,
          uid: rendering.actorEntryUID,
          referencedIdFallback: planarData.volumeId,
        });
      },
      getImageData: (): IImageData | undefined => {
        return buildPlanarVolumeImageData(rendering.imageVolume);
      },
      render: () => {
        ctx.display.requestRender();
      },
      resize: () => {
        this.syncRenderCamera(mount, ctx.viewport.getViewState(), false);
        ctx.display.requestRender();
      },
      removeData: () => {
        this.removeData(mount);
      },
    };
  }

  /**
   * Listens for new voxel data of the volume and for a change of its active
   * time point, and samples the visible slice again for each. A delivery of
   * a load changes frames only (`PlanarSliceSampler.invalidateFrames`): the
   * acquisition plane takes its frame again, and a plane across the frames
   * gathers again the rows of the frames that arrived and uploads only those;
   * the end of the load samples the slice whole once more. While the
   * volume loads, a plane whose frames have no key samples at the ticks of
   * the shared clock of the load updates (`createPlanarLoadingUpdates`), at
   * most once per tick. Where the frames of the plane are few enough to keep their key
   * (`getPlanarFrameDeliveryKey`), a delivery that leaves them as they were
   * (a copy into a frame that the plane does not read) samples nothing, and
   * one that changes them samples at the next animation frame, so the own
   * frame of the plane shows as soon as it arrives; the kept slices are
   * stale all the same, so a move to another plane samples it again. Any other
   * change (an edit of the voxels, the end of the load, a new time point)
   * samples at the next animation frame. An update renders only when the
   * layer drew something before or draws something now (`updateSlice`): an
   * overlay whose frames still hold no data of its plane, and a layer none of
   * whose frames of its plane has arrived (the sampler samples only arrived
   * frames), stay as they were, and the pane draws no frame for them. A
   * change of the texture limits does
   * not concern this path, which holds no 3D texture. The load callback of
   * the volume can come after the listeners are removed; it then does
   * nothing.
   *
   * @returns the function that removes the listeners
   */
  private subscribeToVolumeData(
    mount: CpuSliceMount,
    volumeId: string
  ): () => void {
    const { rendering, sampler } = mount;
    const updates = createPlanarLoadingUpdates(() => {
      const changed = this.updateSlice(
        mount,
        getPlanarRenderPathActiveSourceICamera(mount.ctx)
      );

      if (changed) {
        mount.ctx.display.requestRender();
      }

      return mount.draw.getSlice() !== undefined;
    });
    const removeVolumeSubscriptions = lifecycle.subscribeToVolumeEvents(
      volumeId,
      (eventType) => {
        if (eventType === Events.VOLUME_TEXTURE_LIMITS_CHANGED) {
          return;
        }

        if (
          eventType !== Events.IMAGE_VOLUME_MODIFIED ||
          !isVolumeLoading(rendering.imageVolume)
        ) {
          sampler.invalidate();
          updates.now();
          return;
        }

        sampler.invalidateFrames();

        const update = getPlanarDeliveryUpdate(
          rendering.imageVolume,
          getPlanarRenderPathActiveSourceICamera(mount.ctx),
          resolveSlabThickness(rendering.appearance?.slabThickness),
          mount.deliveryKey
        );

        if (update !== 'none') {
          updates[update]();
        }
      }
    );
    const onTimePointChanged = (evt: Event) => {
      if (
        (evt as CustomEvent<{ volumeId?: string }>).detail?.volumeId !==
        volumeId
      ) {
        return;
      }

      sampler.invalidate();
      updates.now();
    };

    eventTarget.addEventListener(
      Events.DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED,
      onTimePointChanged
    );
    let active = true;

    rendering.imageVolume.load(() => {
      if (active) {
        updates.soon();
      }
    });

    return () => {
      active = false;
      updates.cancel();
      removeVolumeSubscriptions();
      eventTarget.removeEventListener(
        Events.DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED,
        onTimePointChanged
      );
    };
  }

  private updateAppearance(mount: CpuSliceMount, props: unknown): void {
    const { ctx, draw, rendering } = mount;

    rendering.appearance = props as PlanarDisplaySetAppearance | undefined;
    draw.applyAppearance(
      rendering.appearance,
      rendering.isSegmentationOverlay ? undefined : rendering.defaultVOIRange
    );
    this.updateSlice(mount, getPlanarRenderPathActiveSourceICamera(ctx));
    ctx.vtk.renderer.resetCameraClippingRange();
    fitPlanarCameraClippingRange(ctx.vtk.renderer);
  }

  private applyViewState(mount: CpuSliceMount, cameraInput: unknown): void {
    mount.ctx.display.activateRenderMode(PlanarRenderModeId.VTK_CPU_SLICE);
    this.syncRenderCamera(
      mount,
      cameraInput as PlanarViewState | undefined,
      true
    );
  }

  private syncRenderCamera(
    mount: CpuSliceMount,
    camera: PlanarViewState | undefined,
    triggerImageEvent: boolean
  ): void {
    const { ctx, displaySetId, rendering } = mount;
    const projection = resolvePlanarRenderPathProjection({
      ctx,
      displaySetId,
      rendering,
      viewState: camera,
    });

    if (!projection) {
      return;
    }

    if (projection.isSourceBinding) {
      applyPlanarICameraToRenderer({
        renderer: ctx.vtk.renderer,
        activeSourceICamera: projection.resolvedICamera,
      });
    }

    const imageIdIndexChanged =
      projection.currentImageIdIndex !== rendering.currentImageIdIndex;
    const maxImageIdIndexChanged =
      projection.maxImageIdIndex !== rendering.maxImageIdIndex;

    rendering.currentImageIdIndex = projection.currentImageIdIndex;
    rendering.maxImageIdIndex = projection.maxImageIdIndex;

    if (imageIdIndexChanged || maxImageIdIndexChanged) {
      ctx.viewport.invalidateResolvedView();
    }

    this.updateSlice(mount, projection.activeSourceICamera);
    ctx.vtk.renderer.resetCameraClippingRange();
    fitPlanarCameraClippingRange(ctx.vtk.renderer);

    if (triggerImageEvent) {
      triggerPlanarVolumeNewImageOfPlacedSlice(ctx, {
        displaySetId,
        rendering,
        viewState: camera,
        isSourceBinding: projection.isSourceBinding,
        imageIdIndexChanged,
      });
    }
  }

  /**
   * Samples the slice of the camera plane, when the plane or the sampling
   * inputs changed, with pixels of about the voxel size so that a move stays
   * fast, and places the actor for the camera. The kept slice of the screen
   * grid is drawn instead when the screen grid did not move (a change of the
   * appearance). Each call is a change of the view: it cancels the work at
   * rest and starts the rest timer again.
   *
   * @returns false when the layer draws nothing now and drew nothing before
   * (an overlay whose frames still hold no data of its plane, a plane none of
   * whose frames has arrived): its picture did not change, and an update of
   * the load renders nothing for it.
   */
  private updateSlice(
    mount: CpuSliceMount,
    camera: PlanarResolvedICamera | undefined
  ): boolean {
    const { draw, rendering, sampler } = mount;
    const drewSomething = draw.getSlice() !== undefined;

    cancelRestWork(mount);
    recordPlaneMove(mount, camera);
    mount.overlayFrames = getCpuSliceOverlayFrames(mount, camera);
    mount.deliveryKey = getCpuSliceDeliveryKey(mount, camera);

    if (mount.overlayFrames === 'empty') {
      this.drawSlice(mount, camera, undefined);
      reportSamplingState(mount);
      return drewSomething;
    }

    const slice = sampler.sample(
      rendering.imageVolume,
      camera,
      getCpuSliceMountInputs(mount),
      getCanvasScreenSliceGeometry(
        mount.ctx.vtk.canvas,
        camera,
        mount.maxSliceSize
      )
    );

    this.drawSlice(mount, camera, slice);

    if (!slice) {
      mount.fitWhenDrawn = true;
    } else if (mount.fitWhenDrawn) {
      mount.fitWhenDrawn = false;
      fitClippingRangeToSlice(mount);
    }

    reportSamplingState(mount);
    this.scheduleRestWork(mount);

    return drewSomething || draw.getSlice() !== undefined;
  }

  /**
   * Draws a slice and places the actor for the camera. The source sits at
   * overlay order 0; an overlay is placed in front of it, with an order read
   * again here because a remount replaces an actor (`getSliceActorDepthOrder`).
   */
  private drawSlice(
    mount: CpuSliceMount,
    camera: PlanarResolvedICamera | undefined,
    slice: PlanarCpuSlice | undefined
  ): void {
    const { ctx, displaySetId, draw, rendering } = mount;

    draw.setSlice(slice);
    rendering.overlayOrder = getSliceActorDepthOrder(
      ctx,
      displaySetId,
      draw.actor
    );
    draw.followCamera(camera, rendering.overlayOrder);
  }

  /**
   * Starts the work of a view at rest (`scheduleCpuSliceRestWork`): once
   * the view has not changed for CPU_SLICE_REST_DELAY_MS, an oblique
   * slice is sampled once more on the screen grid, one sample per device
   * pixel, when the sampler wants that (`PlanarSliceSampler.sampleFiner`), and
   * drawn. Then the neighbour slices are prefetched in idle time, nearest
   * first and in the direction of the last scroll first. A change of the view
   * stops it (`updateSlice`).
   */
  private scheduleRestWork(mount: CpuSliceMount): void {
    const { ctx, displaySetId, rendering, sampler } = mount;

    mount.cancelRestWork = scheduleCpuSliceRestWork({
      sampler,
      volume: rendering.imageVolume,
      getCamera: () => getPlanarRenderPathActiveSourceICamera(ctx),
      getInputs: () => getCpuSliceMountInputs(mount),
      getScreen: (camera) =>
        getCanvasScreenSliceGeometry(
          ctx.vtk.canvas,
          camera,
          mount.maxSliceSize
        ),
      getNeighbours: (camera) =>
        getNeighbourCameras({
          ctx,
          displaySetId,
          rendering,
          lastStep: mount.lastStep,
          camera,
        }),
      onFinerSlice: (slice) => {
        this.drawSlice(
          mount,
          getPlanarRenderPathActiveSourceICamera(ctx),
          slice
        );
        ctx.display.requestRender();
      },
      onStateChange: () => {
        if (reportSamplingState(mount)) {
          ctx.display.requestRender();
        }
      },
    });
  }

  private removeData(mount: CpuSliceMount): void {
    cancelRestWork(mount);
    mount.rendering.removeStreamingSubscriptions?.();
    mount.draw.remove(mount.ctx.vtk.renderer);
    mount.sampler.release();
  }
}

/**
 * What the layer of a mount may draw of the plane of a camera: a source draws
 * every frame, the coarse preview of a streaming volume too; an overlay
 * follows `getPlanarOverlayFrameState`. A segmentation is not a streaming
 * volume.
 */
function getCpuSliceOverlayFrames(
  mount: CpuSliceMount,
  camera: PlanarResolvedICamera | undefined
): PlanarOverlayFrameState {
  const { ctx, displaySetId, rendering } = mount;

  if (
    rendering.isSegmentationOverlay ||
    ctx.viewport.isCurrentDisplaySetId(displaySetId)
  ) {
    return 'ready';
  }

  return getPlanarOverlayFrameState(
    rendering.imageVolume,
    camera,
    resolveSlabThickness(rendering.appearance?.slabThickness)
  );
}

/** The key of the deliveries of the frames that the plane of a camera reads. */
function getCpuSliceDeliveryKey(
  mount: CpuSliceMount,
  camera: PlanarResolvedICamera | undefined
): string | undefined {
  const { rendering } = mount;

  return getPlanarFrameDeliveryKey(
    rendering.imageVolume,
    camera,
    resolveSlabThickness(rendering.appearance?.slabThickness)
  );
}

/**
 * The sample inputs of a mount: those of its appearance, on the nearest
 * frame while that frame alone holds data of its own position.
 */
function getCpuSliceMountInputs(mount: CpuSliceMount): PlanarCpuSliceInputs {
  const { rendering } = mount;
  const inputs = getPlanarCpuSliceInputs(
    rendering.imageVolume,
    rendering.appearance
  );

  return mount.overlayFrames === 'nearest'
    ? { ...inputs, snapToSlice: true }
    : inputs;
}

/**
 * Fits the clipping range of the camera to the first slice of a layer that
 * drew nothing when the range was last fitted (`CpuSliceMount.fitWhenDrawn`),
 * as a mount fits it to a layer that draws: the range of the slice, then
 * widened to hold every visible prop (`fitPlanarCameraClippingRange`). A
 * load update does not fit the range, so without this the range stays the
 * one of a renderer that held no slice, whose far plane can cut a slice
 * away.
 */
function fitClippingRangeToSlice(mount: CpuSliceMount): void {
  const { renderer } = mount.ctx.vtk;

  renderer.resetCameraClippingRange(mount.draw.actor.getBounds());
  fitPlanarCameraClippingRange(renderer);
}

function cancelRestWork(mount: CpuSliceMount): void {
  mount.cancelRestWork?.();
  mount.cancelRestWork = undefined;
}

/**
 * Keeps on the rendering whether the slab of the view is too large for the
 * CPU (`PlanarSliceSampler.isSlabTooLarge`), and lets the viewport update its
 * render plan when that changes.
 *
 * @returns true when it changed. The sampled slice path renders again after
 * the work at rest only then: a finer slice renders by itself, and a render
 * that changes no pixel would still fire `IMAGE_RENDERED` and restart the
 * debounced work of the tools about 100 ms after every move of the view.
 */
export function reportSamplingState(
  mount: Pick<CpuSliceMount, 'displaySetId' | 'sampler'> & {
    ctx: Pick<CpuSliceMount['ctx'], 'viewport'>;
    rendering: { slabTooLarge?: boolean };
  }
): boolean {
  const { ctx, displaySetId, rendering, sampler } = mount;
  const slabTooLarge = sampler.isSlabTooLarge();

  if (!!rendering.slabTooLarge === slabTooLarge) {
    return false;
  }

  rendering.slabTooLarge = slabTooLarge;
  ctx.viewport.refreshRenderPlan?.(displaySetId);

  return true;
}

/** @internal */
export class VtkCpuSlicePath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarVtkVolumeAdapterContext
    >
{
  readonly id = 'planar:vtk-cpu-slice';
  readonly type = ViewportType.PLANAR;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return (
      data.type === 'image' &&
      options.renderMode === PlanarRenderModeId.VTK_CPU_SLICE
    );
  }

  createRenderPath() {
    return new VtkCpuSliceRenderPath();
  }

  selectContext(
    rootContext: PlanarViewportRenderContext
  ): PlanarVtkVolumeAdapterContext {
    return {
      viewportId: rootContext.viewportId,
      renderingEngineId: rootContext.renderingEngineId,
      type: rootContext.type,
      viewport: rootContext.viewport,
      renderPath: rootContext.renderPath,
      view: rootContext.view,
      display: rootContext.display,
      vtk: rootContext.vtk,
    };
  }
}

/**
 * The largest width or height of a slice that this path draws: the largest 2D
 * texture of the device (`maxTextureSize` of the capability profile), or
 * MAX_SCREEN_SLICE_SIZE without a WebGL profile. An oblique slice and the
 * screen grid are then sampled at full resolution up to what the GPU can hold.
 */
export function getCpuSliceMaxSize(): number {
  const { webgl, maxTextureSize } = getRenderingCapabilities();

  return webgl && maxTextureSize > 0 ? maxTextureSize : MAX_SCREEN_SLICE_SIZE;
}

/**
 * The default VOI of a sampled slice. It is the default VOI of the volume
 * path (`getDefaultVolumeVOIRange`: the VOI of the metadata, else the range of
 * the middle image, 0 to 5 for a PT in SUV). Where that gives nothing, the
 * volume path keeps no transfer function and its actor shows the voxel range
 * of the volume (see `createVolumeSliceActor`), so the voxel range is the
 * default here.
 */
export async function getCpuSliceDefaultVOIRange(
  imageVolume: IImageVolume
): Promise<VOIRange | undefined> {
  const voi = await getDefaultVolumeVOIRange(imageVolume);

  if (
    voi &&
    Number.isFinite(voi.lower) &&
    Number.isFinite(voi.upper) &&
    !(voi.lower === 0 && voi.upper === 0)
  ) {
    return voi;
  }

  const range = imageVolume.voxelManager?.getRange?.();

  if (
    range?.length === 2 &&
    Number.isFinite(range[0]) &&
    Number.isFinite(range[1]) &&
    range[1] > range[0]
  ) {
    return { lower: range[0], upper: range[1] };
  }
}

/**
 * Reads the fidelity of a sampled slice. The sampler reads the full-resolution
 * voxels, so the record is the record of the full grid, as for the CPU volume
 * path, and a later delivery replaces the data while the volume loads. A
 * picture that is not the slab of the view yet, because its steps still run
 * or because it is too large for the CPU, is pending as a loading picture is.
 */
export function refreshCpuSliceFidelity(
  rendering: Pick<
    PlanarVtkCpuSliceRendering,
    'imageVolume' | 'voxelQuality' | 'qualityPending' | 'fullGrid'
  >,
  sampler: PlanarSliceSampler
): void {
  rendering.voxelQuality = rendering.imageVolume.getVoxelQuality?.();
  rendering.qualityPending =
    isVolumeLoading(rendering.imageVolume) ||
    sampler.hasPendingSteps() ||
    sampler.isSlabTooLarge();
  rendering.fullGrid = rendering.imageVolume.voxelGrid;
}
