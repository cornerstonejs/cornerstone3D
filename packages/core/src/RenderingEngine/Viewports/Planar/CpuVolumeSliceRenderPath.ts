import { buildPlanarActorEntry } from './buildPlanarActorEntry';
import CanvasActor from '../../CanvasActor';
import {
  Events,
  InterpolationType,
  ViewportStatus,
  ViewportType,
} from '../../../enums';
import eventTarget from '../../../eventTarget';
import { ActorRenderMode } from '../../../types';
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
  PlanarDataPresentation,
  PlanarCpuVolumeAdapterContext,
  PlanarPayload,
  PlanarViewportRenderContext,
} from './PlanarViewportTypes';
import type { PlanarCpuVolumeRendering } from './planarRuntimeTypes';
import { triggerPlanarVolumeNewImageOfPlacedSlice } from './planarImageEvents';
import {
  getPlanarRenderPathActiveSourceICamera,
  resolvePlanarRenderPathProjection,
} from './planarRenderPathProjection';
import {
  PlanarSliceSampler,
  getPlanarSampledSliceInputs,
} from './planarSampledSlice';
import type {
  PlanarSampledSlice,
  PlanarSampledSliceInputs,
} from './planarSampledSlice';
import {
  PlanarSampledSliceCanvas,
  beginPlanarCanvasPass,
  getResolvedVOIRange,
} from './planarSampledSliceCanvas';
import {
  getCanvasScreenSliceGeometry,
  getNeighbourCameras,
  recordPlaneMove,
  scheduleSampledSliceRestWork,
} from './planarSampledSliceRest';
import type { PlanarSlicePlaneMoves } from './planarSampledSliceRest';
import { buildPlanarVolumeImageData } from './VtkVolumeSliceRenderPath';
import {
  getSampledSliceDefaultVOIRange,
  refreshSampledSliceFidelity,
  reportSamplingState,
} from './VtkSampledSliceRenderPath';
import { isSegmentationOverlayData } from '../renderingFidelity';

/**
 * The largest width or height of a slice that this path draws: 16384, the
 * side of the largest 2D canvas that browsers make. An oblique slice and the
 * screen grid are sampled at full resolution up to that size.
 */
export const MAX_CPU_CANVAS_SLICE_SIZE = 16384;

/** The parts of one mounted CPU volume slice. */
type CpuVolumeSliceMount = PlanarSlicePlaneMoves & {
  ctx: PlanarCpuVolumeAdapterContext;
  dataId: string;
  rendering: PlanarCpuVolumeRendering;
  sampler: PlanarSliceSampler;
  draw: PlanarSampledSliceCanvas;
  /** Cancels the pending work at rest: the rest timer or an idle prefetch. */
  cancelRestWork?: () => void;
  /** The slice drawn last and the screen grid it was drawn for. */
  shownSlice?: PlanarSampledSlice;
  shownScreen?: VolumeSliceGeometry;
  /**
   * The plane, screen grid and inputs of the last request to the sampler. A
   * render for the same request draws the slice on screen and does not ask
   * the sampler again, since a request is a move of the view to the sampler
   * and would stop the work at rest of this view.
   */
  sampledFor?: string;
};

/**
 * The render path of `cpuVolume`: a volume-backed display set whose visible
 * slice is cut out of the volume on the CPU and drawn on the 2D canvas of the
 * viewport.
 *
 * It wires the same two steps as the sampled slice path of the GPU
 * (`VtkSampledSliceRenderPath`): the sample step (`PlanarSliceSampler`, plain
 * data, with its cache of neighbour slices, slabs and time points) and a draw
 * step (`PlanarSampledSliceCanvas`, the only part that knows the canvas
 * drawing). The slice is sampled when the viewport renders; a render with the
 * same plane and inputs finds the kept slice. When the slice on screen or the
 * screen grid changes, the work at rest starts again
 * (`scheduleSampledSliceRestWork`): a slice that the canvas cannot enlarge
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
export class CpuVolumeSliceRenderPath
  implements RenderPath<PlanarCpuVolumeAdapterContext>
{
  async addData(
    ctx: PlanarCpuVolumeAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<PlanarDataPresentation>> {
    const payload: PlanarPayload = data as unknown as LoadedData<PlanarPayload>;

    if (!payload.imageVolume) {
      throw new Error(
        '[PlanarViewport] CPU volume rendering requires a prepared image volume'
      );
    }

    const compositeActor = payload.reference?.kind === 'segmentation';
    const defaultVOIRange = await getSampledSliceDefaultVOIRange(
      payload.imageVolume
    );
    const sampler = new PlanarSliceSampler({
      enlargesColours: true,
      keepFractions: !compositeActor,
      maxSliceSize: MAX_CPU_CANVAS_SLICE_SIZE,
      sampleSlabsInSteps: true,
      outsideValue: compositeActor ? 0 : undefined,
    });
    const draw = new PlanarSampledSliceCanvas(
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
    ctx.display.activateRenderMode(ActorRenderMode.CPU_VOLUME);

    const rendering: PlanarCpuVolumeRendering = {
      renderMode: ActorRenderMode.CPU_VOLUME,
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
      dataId: data.id,
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
      updateDataPresentation: (props) => {
        this.updateDataPresentation(mount, props);
      },
      applyViewState: (camera) => {
        ctx.display.activateRenderMode(ActorRenderMode.CPU_VOLUME);
        this.syncRenderCamera(mount, camera as PlanarViewState | undefined);
      },
      getFrameOfReferenceUID: () => {
        return rendering.imageVolume.metadata?.FrameOfReferenceUID;
      },
      getActorEntry: (data) => {
        const planarData = data as LoadedData<PlanarPayload>;

        return buildPlanarActorEntry(planarData, {
          actor: rendering.compatibilityActor,
          renderMode: ActorRenderMode.CPU_VOLUME,
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
   * again, and asks for a render. A progressive or edited update
   * (`IMAGE_VOLUME_MODIFIED`) renders at most once per
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

      removeVolumeSubscriptions();
      eventTarget.removeEventListener(
        Events.DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED,
        onTimePointChanged
      );
    };
  }

  private updateDataPresentation(
    mount: CpuVolumeSliceMount,
    props: unknown
  ): void {
    const { ctx, rendering } = mount;
    const previousInterpolationType =
      rendering.dataPresentation?.interpolationType;
    const dataPresentation =
      (props as PlanarDataPresentation | undefined) || {};

    rendering.dataPresentation = Object.keys(dataPresentation).length
      ? dataPresentation
      : undefined;
    rendering.renderingInvalidated = true;

    if (
      previousInterpolationType !==
      rendering.dataPresentation?.interpolationType
    ) {
      this.syncRenderCamera(mount, ctx.viewport.getViewState());
    }
  }

  private syncRenderCamera(
    mount: CpuVolumeSliceMount,
    camera: PlanarViewState | undefined
  ): void {
    const { ctx, dataId, rendering } = mount;
    const projection = resolvePlanarRenderPathProjection({
      ctx,
      dataId,
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

    ctx.display.activateRenderMode(ActorRenderMode.CPU_VOLUME);
    ctx.cpu.canvas.style.display = '';
    ctx.cpu.canvas.style.opacity = '1';

    if (rendering.dataPresentation?.visible === false) {
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

    const screen = getCanvasScreenSliceGeometry(
      ctx.cpu.canvas,
      camera,
      MAX_CPU_CANVAS_SLICE_SIZE
    );
    const inputs = getCpuSliceInputs(rendering);
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
      presentation: rendering.dataPresentation,
      defaultVOIRange: rendering.defaultVOIRange,
      invalidated: rendering.renderingInvalidated,
      canvasActor: rendering.compositeActor
        ? rendering.compatibilityActor
        : undefined,
    });
    rendering.defaultVOIRange ||= getResolvedVOIRange(
      rendering.dataPresentation?.voiRange,
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
    const { ctx, dataId, rendering, sampler } = mount;

    mount.cancelRestWork?.();
    mount.cancelRestWork = scheduleSampledSliceRestWork({
      sampler,
      volume: rendering.imageVolume,
      getCamera: () => getPlanarRenderPathActiveSourceICamera(ctx),
      getInputs: () => getCpuSliceInputs(rendering),
      getScreen: (camera) =>
        getCanvasScreenSliceGeometry(
          ctx.cpu.canvas,
          camera,
          MAX_CPU_CANVAS_SLICE_SIZE
        ),
      getNeighbours: (camera) =>
        getNeighbourCameras({
          ctx,
          dataId,
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
 * (`getPlanarSampledSliceInputs`). The sampler samples a large slab in steps
 * (`PlanarSliceSamplerOptions.sampleSlabsInSteps`), as for the sampled slice
 * path, and shows the plain slice of the plane until the slab is done. A
 * labelmap is sampled with NEAREST, as the GPU reads a labelmap, so a slice
 * along a volume axis stays the slice of its voxels and a pixel never mixes
 * two labels.
 */
function getCpuSliceInputs(
  rendering: PlanarCpuVolumeRendering
): PlanarSampledSliceInputs {
  const inputs = getPlanarSampledSliceInputs(
    rendering.imageVolume,
    rendering.dataPresentation
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
 * (`refreshSampledSliceFidelity`): a slab whose steps still run, or that is
 * too large for the CPU, is pending as a loading picture is. The slice on
 * screen is never an interactive reduction.
 */
function refreshCpuVolumeFidelity(
  rendering: PlanarCpuVolumeRendering,
  sampler: PlanarSliceSampler
): void {
  refreshSampledSliceFidelity(rendering, sampler);
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
export class CpuVolumeSlicePath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarCpuVolumeAdapterContext
    >
{
  readonly id = 'planar:cpu-volume-slice';
  readonly type = ViewportType.PLANAR;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return (
      data.type === 'image' && options.renderMode === ActorRenderMode.CPU_VOLUME
    );
  }

  createRenderPath() {
    return new CpuVolumeSliceRenderPath();
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
