import { buildPlanarActorEntry } from './buildPlanarActorEntry';
import CanvasActor from '../../CanvasActor';
import {
  Events,
  InterpolationType,
  ViewportStatus,
  ViewportType,
} from '../../../enums';
import eventTarget from '../../../eventTarget';
import { PlanarRenderModeId } from './planarRenderModeIds';
import type { IImageVolume } from '../../../types';
import type { IViewport } from '../../../types/IViewport';
import triggerEvent from '../../../utilities/triggerEvent';
import * as lifecycle from '../../helpers/volumeStrategyLifecycle';
import { getConfiguration } from '../../../init';
import uuidv4 from '../../../utilities/uuidv4';
import type { VolumeSliceGeometry } from '../../../utilities/volumeSliceGeometry';
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
  PlanarCpuVolumeAdapterContext,
  PlanarPayload,
  PlanarViewportRenderContext,
} from './PlanarViewportTypes';
import type { PlanarCanvasCpuSliceRendering } from './planarRuntimeTypes';
import { triggerPlanarVolumeNewImageOfPlacedSlice } from './planarImageEvents';
import {
  getPlanarRenderPathActiveSourceICamera,
  resolvePlanarRenderPathProjection,
} from './planarRenderPathProjection';
import { PlanarSliceSampler, getPlanarCpuSliceInputs } from './planarCpuSlice';
import type { PlanarCpuSlice, PlanarCpuSliceInputs } from './planarCpuSlice';
import {
  PlanarCpuSliceCanvas,
  beginPlanarCanvasPass,
  getResolvedVOIRange,
} from './planarCpuSliceCanvas';
import {
  getCanvasScreenSliceGeometry,
  getNeighbourCameras,
  recordPlaneMove,
  scheduleCpuSliceRestWork,
} from './planarCpuSliceRest';
import type { PlanarSlicePlaneMoves } from './planarCpuSliceRest';
import { buildPlanarVolumeImageData } from './VtkGpuVolumeSliceRenderPath';
import {
  getCpuSliceDefaultVOIRange,
  refreshCpuSliceFidelity,
  reportSamplingState,
} from './VtkCpuSliceRenderPath';
import {
  isSegmentationOverlayData,
  isVolumeLoading,
} from '../renderingFidelity';
import {
  getPlanarDeliveryUpdate,
  getPlanarFrameDeliveryKey,
  getPlanarOverlayFrameState,
} from './planarOverlayFrames';
import type { PlanarOverlayFrameState } from './planarOverlayFrames';
import { resolveSlabThickness } from './planarVolumeSliceBlendMode';

/**
 * The largest width or height of a slice that this path draws: 16384, the
 * side of the largest 2D canvas that browsers make. An oblique slice and the
 * screen grid are sampled at full resolution up to that size.
 */
export const MAX_CPU_CANVAS_SLICE_SIZE = 16384;

/** The parts of one mounted CPU volume slice. */
type CpuVolumeSliceMount = PlanarSlicePlaneMoves & {
  ctx: PlanarCpuVolumeAdapterContext;
  displaySetId: string;
  rendering: PlanarCanvasCpuSliceRendering;
  sampler: PlanarSliceSampler;
  draw: PlanarCpuSliceCanvas;
  /** Cancels the pending work at rest: the rest timer or an idle prefetch. */
  cancelRestWork?: () => void;
  /** The slice drawn last and the screen grid it was drawn for. */
  shownSlice?: PlanarCpuSlice;
  shownScreen?: VolumeSliceGeometry;
  /**
   * The plane, screen grid and inputs of the last request to the sampler. A
   * render for the same request draws the slice on screen and does not ask
   * the sampler again, since a request is a move of the view to the sampler
   * and would stop the work at rest of this view.
   */
  sampledFor?: string;
  /** What the layer may draw of the plane of the last render. */
  overlayFrames?: PlanarOverlayFrameState;
  /**
   * The key of the deliveries of the frames of the plane of the last render
   * (`getPlanarFrameDeliveryKey`), when one is kept.
   */
  deliveryKey?: string;
};

/**
 * The render path of `cpuVolume`: a volume-backed display set whose visible
 * slice is cut out of the volume on the CPU and drawn on the 2D canvas of the
 * viewport.
 *
 * It wires the same two steps as the sampled slice path of the GPU
 * (`VtkCpuSliceRenderPath`): the sample step (`PlanarSliceSampler`, plain
 * data, with its cache of neighbour slices, slabs and time points) and a draw
 * step (`PlanarCpuSliceCanvas`, the only part that knows the canvas
 * drawing). The slice is sampled when the viewport renders; a render with the
 * same plane and inputs finds the kept slice. When the slice on screen or the
 * screen grid changes, the work at rest starts again
 * (`scheduleCpuSliceRestWork`): a slice that the canvas cannot enlarge
 * exactly is sampled once more on the screen grid, and the neighbours are
 * prefetched. The canvas enlarges colours, not values, so that is every
 * LINEAR slice, an oblique NEAREST slice and a maximum or minimum slab
 * (`PlanarSliceSamplerOptions.enlargesColours`); a NEAREST slice along a
 * volume axis stays the voxel-size slice, enlarged without smoothing. A large
 * slab is sampled in steps at rest, as on the sampled slice path, and the
 * plain slice of the plane is shown until it is done.
 *
 * @internal
 */
export class CanvasCpuSliceRenderPath
  implements RenderPath<PlanarCpuVolumeAdapterContext>
{
  async addData(
    ctx: PlanarCpuVolumeAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<PlanarDisplaySetAppearance>> {
    const payload: PlanarPayload = data as unknown as LoadedData<PlanarPayload>;

    if (!payload.imageVolume) {
      throw new Error(
        '[PlanarViewport] CPU volume rendering requires a prepared image volume'
      );
    }

    const compositeActor = payload.reference?.kind === 'segmentation';
    const defaultVOIRange = await getCpuSliceDefaultVOIRange(
      payload.imageVolume
    );
    const sampler = new PlanarSliceSampler({
      enlargesColours: true,
      keepFractions: !compositeActor,
      maxSliceSize: MAX_CPU_CANVAS_SLICE_SIZE,
      sampleSlabsInSteps: true,
      outsideValue: compositeActor ? 0 : undefined,
    });
    const draw = new PlanarCpuSliceCanvas(
      payload.imageVolume,
      ctx.cpu.canvas.width,
      ctx.cpu.canvas.height
    );
    const compatibilityActor = new CanvasActor(
      {
        getImageData: () => buildPlanarVolumeImageData(payload.imageVolume),
      } as unknown as IViewport,
      payload.imageVolume.imageIds?.length
        ? { imageId: payload.imageVolume.imageIds[0] }
        : {}
    );

    compatibilityActor.setVisibility(true);
    ctx.display.activateRenderMode(PlanarRenderModeId.CANVAS_CPU_SLICE);

    const rendering: PlanarCanvasCpuSliceRendering = {
      renderMode: PlanarRenderModeId.CANVAS_CPU_SLICE,
      actorEntryUID: uuidv4(),
      excludeFromFidelity: isSegmentationOverlayData(payload, options),
      fullGrid: payload.imageVolume.voxelGrid,
      sampleDistanceLod: 1,
      compatibilityActor,
      imageVolume: payload.imageVolume,
      imageIds: payload.imageIds,
      acquisitionOrientation: payload.acquisitionOrientation,
      currentImageIdIndex: payload.initialImageIdIndex ?? 0,
      maxImageIdIndex: payload.imageIds.length - 1,
      defaultVOIRange,
      renderingInvalidated: true,
      compositeActor,
      getSliceCacheStatistics: () => sampler.getStatistics(),
    };
    const mount: CpuVolumeSliceMount = {
      ctx,
      displaySetId: data.id,
      rendering,
      sampler,
      draw,
    };

    rendering.refreshFidelity = () =>
      refreshCpuVolumeFidelity(rendering, sampler);
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
        ctx.display.activateRenderMode(PlanarRenderModeId.CANVAS_CPU_SLICE);
        this.syncRenderCamera(mount, camera as PlanarViewState | undefined);
      },
      getFrameOfReferenceUID: () => {
        return rendering.imageVolume.metadata?.FrameOfReferenceUID;
      },
      getActorEntry: (data) => {
        const planarData = data as LoadedData<PlanarPayload>;

        return buildPlanarActorEntry(planarData, {
          actor: rendering.compatibilityActor,
          uid: rendering.actorEntryUID,
          referencedIdFallback: planarData.volumeId,
        });
      },
      getImageData: () => {
        return buildPlanarVolumeImageData(rendering.imageVolume);
      },
      render: () => {
        this.render(mount);
      },
      resize: () => {
        this.syncRenderCamera(mount, ctx.viewport.getViewState());
      },
      removeData: () => {
        this.removeData(mount);
      },
    };
  }

  /**
   * Listens for new voxel data of the volume and for a change of its active
   * time point. Each makes the kept slices stale, so the next render samples
   * again, and asks for a render. A delivery while the volume loads follows
   * the rule of both sampled slice paths (`getPlanarDeliveryUpdate`): one that
   * leaves the frames of the plane as they were samples nothing (the slice on
   * screen stays, the kept slices of other planes are stale), and so does one
   * to an overlay that drew nothing and still has nothing to draw; one that
   * changes them renders at the next animation frame, and one for a plane
   * without a key renders as an edit does. An edit of the voxels
   * (`IMAGE_VOLUME_MODIFIED` of a loaded volume) renders at most once per
   * `rendering.planar.cpuVolume.volumeModifiedThrottleMs`; the end of the load
   * renders at once and once more at the next animation frame, because the
   * completion event can arrive before the streamed voxels are stable; a new
   * time point renders at once.
   *
   * @returns the function that removes the listeners
   */
  private subscribeToVolumeData(
    mount: CpuVolumeSliceMount,
    volumeId: string
  ): () => void {
    const { ctx, rendering, sampler } = mount;
    const voxelManager = rendering.imageVolume.voxelManager;
    const throttleMs = getCpuVolumeModifiedThrottleMs();
    let isActive = true;
    let frameId: number | undefined;
    let deliveryFrameId: number | undefined;
    let throttleTimeoutId: number | undefined;
    let lastThrottledRenderTime = -Infinity;
    const invalidate = () => {
      voxelManager?.invalidateCache?.();
      sampler.invalidate();
      mount.sampledFor = undefined;
      rendering.pendingVolumeLoadCallback = false;
      rendering.renderingInvalidated = true;
    };
    const renderThrottled = () => {
      lastThrottledRenderTime = performance.now();
      ctx.display.renderNow();
    };
    const clearThrottle = () => {
      if (throttleTimeoutId !== undefined) {
        window.clearTimeout(throttleTimeoutId);
        throttleTimeoutId = undefined;
      }
    };
    const onVolumeModified = () => {
      const remainingDelay = Math.max(
        0,
        throttleMs - (performance.now() - lastThrottledRenderTime)
      );

      if (throttleMs <= 0 || remainingDelay === 0) {
        renderThrottled();
        return;
      }

      if (throttleTimeoutId !== undefined) {
        return;
      }

      throttleTimeoutId = window.setTimeout(() => {
        throttleTimeoutId = undefined;

        if (isActive) {
          renderThrottled();
        }
      }, remainingDelay);
    };
    const onDelivery = () => {
      const camera = getPlanarRenderPathActiveSourceICamera(ctx);
      const update = getPlanarDeliveryUpdate(
        rendering.imageVolume,
        camera,
        resolveSlabThickness(rendering.appearance?.slabThickness),
        mount.deliveryKey
      );

      if (
        update === 'none' ||
        (mount.overlayFrames === 'empty' &&
          getCanvasSliceOverlayFrames(mount, camera) === 'empty')
      ) {
        voxelManager?.invalidateCache?.();
        sampler.invalidate();
        return;
      }

      invalidate();

      if (update === 'soon') {
        onVolumeModified();
        return;
      }

      if (deliveryFrameId === undefined) {
        deliveryFrameId = window.requestAnimationFrame(() => {
          deliveryFrameId = undefined;

          if (isActive) {
            ctx.display.renderNow();
          }
        });
      }
    };
    const onLoadingCompleted = () => {
      clearThrottle();
      ctx.display.renderNow();

      if (!isActive) {
        return;
      }

      ctx.display.setNeedsRender();
      frameId = window.requestAnimationFrame(() => {
        frameId = undefined;

        if (!isActive) {
          return;
        }

        invalidate();
        ctx.display.renderNow();
      });
    };
    const removeVolumeSubscriptions = lifecycle.subscribeToVolumeEvents(
      volumeId,
      (eventType) => {
        if (!isActive || eventType === Events.VOLUME_TEXTURE_LIMITS_CHANGED) {
          return;
        }

        if (
          eventType === Events.IMAGE_VOLUME_MODIFIED &&
          isVolumeLoading(rendering.imageVolume)
        ) {
          onDelivery();
          return;
        }

        invalidate();

        if (eventType === Events.IMAGE_VOLUME_MODIFIED) {
          onVolumeModified();
          return;
        }

        onLoadingCompleted();
      }
    );
    const onTimePointChanged = (evt: Event) => {
      if (
        !isActive ||
        (evt as CustomEvent<{ volumeId?: string }>).detail?.volumeId !==
          volumeId
      ) {
        return;
      }

      invalidate();
      ctx.display.renderNow();
    };

    eventTarget.addEventListener(
      Events.DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED,
      onTimePointChanged
    );

    return () => {
      isActive = false;
      rendering.pendingVolumeLoadCallback = false;
      clearThrottle();

      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
        frameId = undefined;
      }

      if (deliveryFrameId !== undefined) {
        window.cancelAnimationFrame(deliveryFrameId);
        deliveryFrameId = undefined;
      }

      removeVolumeSubscriptions();
      eventTarget.removeEventListener(
        Events.DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED,
        onTimePointChanged
      );
    };
  }

  private updateAppearance(mount: CpuVolumeSliceMount, props: unknown): void {
    const { ctx, rendering } = mount;
    const previousInterpolationType = rendering.appearance?.interpolationType;
    const appearance = (props as PlanarDisplaySetAppearance | undefined) || {};

    rendering.appearance = Object.keys(appearance).length
      ? appearance
      : undefined;
    rendering.renderingInvalidated = true;

    if (previousInterpolationType !== rendering.appearance?.interpolationType) {
      this.syncRenderCamera(mount, ctx.viewport.getViewState());
    }
  }

  private syncRenderCamera(
    mount: CpuVolumeSliceMount,
    camera: PlanarViewState | undefined
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

    const { currentImageIdIndex, maxImageIdIndex } = projection;
    const imageIdIndexChanged =
      currentImageIdIndex !== rendering.currentImageIdIndex;
    const maxImageIdIndexChanged =
      maxImageIdIndex !== rendering.maxImageIdIndex;

    rendering.currentImageIdIndex = currentImageIdIndex;
    rendering.maxImageIdIndex = maxImageIdIndex;
    rendering.renderingInvalidated = true;

    if (imageIdIndexChanged || maxImageIdIndexChanged) {
      ctx.viewport.invalidateResolvedView();
    }

    triggerPlanarVolumeNewImageOfPlacedSlice(ctx, {
      displaySetId,
      rendering,
      viewState: camera,
      isSourceBinding: projection.isSourceBinding,
      imageIdIndexChanged,
    });
  }

  /**
   * Draws the slice of the camera plane. The slice comes from the sampler,
   * which samples only when the plane, the inputs or the voxels changed. A
   * volume that has no voxels yet starts its load and draws nothing.
   */
  private render(mount: CpuVolumeSliceMount): void {
    const { ctx, draw, rendering, sampler } = mount;

    ctx.display.activateRenderMode(PlanarRenderModeId.CANVAS_CPU_SLICE);
    ctx.cpu.canvas.style.display = '';
    ctx.cpu.canvas.style.opacity = '1';

    if (rendering.appearance?.visible === false) {
      beginPlanarCanvasPass(ctx.cpu);
      return;
    }

    if (!isVolumeReady(rendering.imageVolume)) {
      if (!rendering.pendingVolumeLoadCallback) {
        rendering.pendingVolumeLoadCallback = true;
        rendering.imageVolume.load();
      }
      ctx.display.setNeedsRender();
      return;
    }

    rendering.pendingVolumeLoadCallback = false;

    if (!ctx.cpu.canvas.width || !ctx.cpu.canvas.height) {
      return;
    }

    const camera = getPlanarRenderPathActiveSourceICamera(ctx);

    if (!camera) {
      return;
    }

    beginPlanarCanvasPass(ctx.cpu);
    refreshCpuVolumeFidelity(rendering, sampler);
    recordPlaneMove(mount, camera);
    mount.overlayFrames = getCanvasSliceOverlayFrames(mount, camera);
    mount.deliveryKey = getPlanarFrameDeliveryKey(
      rendering.imageVolume,
      camera,
      resolveSlabThickness(rendering.appearance?.slabThickness)
    );

    if (mount.overlayFrames === 'empty') {
      mount.shownSlice = undefined;
      mount.sampledFor = undefined;
      return;
    }

    const screen = getCanvasScreenSliceGeometry(
      ctx.cpu.canvas,
      camera,
      MAX_CPU_CANVAS_SLICE_SIZE
    );
    const inputs = getCanvasSliceMountInputs(mount);
    const request = JSON.stringify([
      camera.focalPoint,
      camera.viewPlaneNormal,
      screen,
      inputs,
    ]);
    const slice =
      request === mount.sampledFor && mount.shownSlice
        ? mount.shownSlice
        : sampler.sample(rendering.imageVolume, camera, inputs, screen);

    mount.sampledFor = request;

    if (!slice) {
      mount.shownSlice = undefined;
      return;
    }

    if (
      slice !== mount.shownSlice ||
      !isSameGeometry(mount.shownScreen, screen)
    ) {
      this.restartRestWork(mount);
    }

    mount.shownSlice = slice;
    mount.shownScreen = screen;

    const { image, changed } = draw.setSlice(slice);

    if (changed) {
      rendering.renderingInvalidated = true;
      rendering.compatibilityActor
        .getMapper()
        .getInputData()
        .setDerivedImage(image);
    }

    draw.draw({
      target: ctx.cpu,
      camera,
      appearance: rendering.appearance,
      defaultVOIRange: rendering.defaultVOIRange,
      invalidated: rendering.renderingInvalidated,
      canvasActor: rendering.compositeActor
        ? rendering.compatibilityActor
        : undefined,
    });
    rendering.defaultVOIRange ||= getResolvedVOIRange(
      rendering.appearance?.voiRange,
      image.minPixelValue ?? 0,
      image.maxPixelValue ?? 1
    );
    rendering.renderingInvalidated = false;
    ctx.display.markRendered();
    triggerEvent(ctx.viewport.element, Events.IMAGE_RENDERED, {
      element: ctx.viewport.element,
      viewportId: ctx.viewportId,
      renderingEngineId: ctx.renderingEngineId,
      viewportStatus: ViewportStatus.RENDERED,
    });
  }

  /**
   * Cancels the work at rest and starts it again for the view on screen. A
   * slice of the screen grid sampled at rest is drawn with a render of the
   * viewport, which finds it as the slice on screen and does not start the
   * work again.
   */
  private restartRestWork(mount: CpuVolumeSliceMount): void {
    const { ctx, displaySetId, rendering, sampler } = mount;

    mount.cancelRestWork?.();
    mount.cancelRestWork = scheduleCpuSliceRestWork({
      sampler,
      volume: rendering.imageVolume,
      getCamera: () => getPlanarRenderPathActiveSourceICamera(ctx),
      getInputs: () => getCanvasSliceMountInputs(mount),
      getScreen: (camera) =>
        getCanvasScreenSliceGeometry(
          ctx.cpu.canvas,
          camera,
          MAX_CPU_CANVAS_SLICE_SIZE
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
        mount.shownSlice = slice;
        rendering.renderingInvalidated = true;
        ctx.display.renderNow();
      },
      onStateChange: () => {
        reportSamplingState(mount);
        ctx.display.renderNow();
      },
    });
  }

  private removeData(mount: CpuVolumeSliceMount): void {
    mount.cancelRestWork?.();
    mount.cancelRestWork = undefined;
    mount.rendering.removeStreamingSubscriptions?.();
    mount.sampler.release();
    mount.draw.release();
    mount.shownSlice = undefined;
    mount.sampledFor = undefined;
  }
}

/**
 * The sampling inputs of a CPU volume slice: those of the sampled slice path
 * (`getPlanarCpuSliceInputs`). The sampler samples a large slab in steps
 * (`PlanarSliceSamplerOptions.sampleSlabsInSteps`), as for the sampled slice
 * path, and shows the plain slice of the plane until the slab is done. A
 * labelmap is sampled with NEAREST, as the GPU reads a labelmap, so a slice
 * along a volume axis stays the slice of its voxels and a pixel never mixes
 * two labels.
 */
/**
 * What the layer of a mount may draw of the plane of a camera: a source draws
 * every frame, an overlay follows `getPlanarOverlayFrameState`, and a
 * segmentation is not a streaming volume.
 */
function getCanvasSliceOverlayFrames(
  mount: CpuVolumeSliceMount,
  camera: Parameters<typeof getPlanarOverlayFrameState>[1]
): PlanarOverlayFrameState {
  const { ctx, displaySetId, rendering } = mount;

  if (
    rendering.compositeActor ||
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

/**
 * The sample inputs of a mount, on the nearest frame while that frame alone
 * holds data of its own position.
 */
function getCanvasSliceMountInputs(
  mount: CpuVolumeSliceMount
): PlanarCpuSliceInputs {
  const inputs = getCpuSliceInputs(mount.rendering);

  return mount.overlayFrames === 'nearest'
    ? { ...inputs, snapToSlice: true }
    : inputs;
}

function getCpuSliceInputs(
  rendering: PlanarCanvasCpuSliceRendering
): PlanarCpuSliceInputs {
  const inputs = getPlanarCpuSliceInputs(
    rendering.imageVolume,
    rendering.appearance
  );

  return rendering.compositeActor
    ? { ...inputs, interpolationType: InterpolationType.NEAREST }
    : inputs;
}

/**
 * Whether a volume can be drawn: it is loaded, it has no load status, or some
 * of its frames have arrived.
 */
function isVolumeReady(imageVolume: IImageVolume): boolean {
  const streamingState = imageVolume as unknown as {
    loadStatus?: { loaded?: boolean };
    framesLoaded?: number;
    framesProcessed?: number;
    framesUpdated?: number;
  };

  return (
    streamingState.loadStatus === undefined ||
    streamingState.loadStatus.loaded === true ||
    (streamingState.framesLoaded ?? 0) > 0 ||
    (streamingState.framesProcessed ?? 0) > 0 ||
    (streamingState.framesUpdated ?? 0) > 0
  );
}

/**
 * Reads the fidelity of a CPU volume slice as for a sampled slice
 * (`refreshCpuSliceFidelity`): a slab whose steps still run, or that is
 * too large for the CPU, is pending as a loading picture is. The slice on
 * screen is never an interactive reduction.
 */
function refreshCpuVolumeFidelity(
  rendering: PlanarCanvasCpuSliceRendering,
  sampler: PlanarSliceSampler
): void {
  refreshCpuSliceFidelity(rendering, sampler);
  rendering.interactiveReduction = false;
}

/** Whether two slice geometries are the same, number for number. */
export function isSameGeometry(
  previous: VolumeSliceGeometry | undefined,
  next: VolumeSliceGeometry | undefined
): boolean {
  if (!previous || !next) {
    return previous === next;
  }

  return (
    previous.width === next.width &&
    previous.height === next.height &&
    previous.spacing.every((value, index) => value === next.spacing[index]) &&
    previous.origin.every((value, index) => value === next.origin[index]) &&
    previous.xDirection.every(
      (value, index) => value === next.xDirection[index]
    ) &&
    previous.yDirection.every(
      (value, index) => value === next.yDirection[index]
    )
  );
}

function getCpuVolumeModifiedThrottleMs(): number {
  const throttleMs =
    getConfiguration().rendering?.planar?.cpuVolume?.volumeModifiedThrottleMs;

  if (!Number.isFinite(throttleMs)) {
    return 0;
  }

  return Math.max(0, Math.trunc(throttleMs));
}

/** @internal */
export class CanvasCpuSlicePath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarCpuVolumeAdapterContext
    >
{
  readonly id = 'planar:canvas-cpu-slice';
  readonly type = ViewportType.PLANAR;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return (
      data.type === 'image' &&
      options.renderMode === PlanarRenderModeId.CANVAS_CPU_SLICE
    );
  }

  createRenderPath() {
    return new CanvasCpuSliceRenderPath();
  }

  selectContext(
    rootContext: PlanarViewportRenderContext
  ): PlanarCpuVolumeAdapterContext {
    return {
      viewportId: rootContext.viewportId,
      renderingEngineId: rootContext.renderingEngineId,
      type: rootContext.type,
      viewport: rootContext.viewport,
      renderPath: rootContext.renderPath,
      view: rootContext.view,
      display: rootContext.display,
      cpu: rootContext.cpu,
    };
  }
}
