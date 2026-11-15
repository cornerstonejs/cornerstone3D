import { vec3 } from 'gl-matrix';
import { buildPlanarActorEntry } from './buildPlanarActorEntry';
import uuidv4 from '../../../utilities/uuidv4';
import { Events, ViewportType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import { getDefaultVolumeVOIRange } from '../../helpers/setDefaultVolumeVOI';
import * as lifecycle from '../../helpers/volumeStrategyLifecycle';
import { ActorRenderMode } from '../../../types';
import type {
  IImageData,
  IImageVolume,
  Point3,
  VOIRange,
} from '../../../types';
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
  PlanarPayload,
  PlanarResolvedICamera,
  PlanarViewportRenderContext,
  PlanarVtkVolumeAdapterContext,
} from './PlanarViewportTypes';
import type { PlanarSampledSliceRendering } from './planarRuntimeTypes';
import { triggerPlanarVolumeNewImage } from './planarImageEvents';
import { applyPlanarICameraToRenderer } from './planarRenderCamera';
import {
  getPlanarRenderPathActiveSourceICamera,
  resolvePlanarRenderPathProjection,
} from './planarRenderPathProjection';
import type { PlanarRenderPathProjectionCamera } from './planarRenderPathProjection';
import { resolvePlanarViewportView } from './PlanarResolvedView';
import {
  PlanarSliceSampler,
  SAMPLED_SLICE_PREFETCH_NEIGHBOURS,
  getPlanarSampledSliceInputs,
  getScreenSliceGeometry,
  getVolumeClipPlanes,
} from './planarSampledSlice';
import type { PlanarSampledSlice } from './planarSampledSlice';
import type { VolumeSliceGeometry } from '../../../utilities/volumeSliceGeometry';
import { PlanarSampledSliceActor } from './planarSampledSliceActor';
import {
  buildPlanarVolumeImageData,
  getSliceActorDepthOrder,
} from './VtkVolumeSliceRenderPath';
import {
  isSegmentationOverlayData,
  isVolumeLoading,
} from '../renderingFidelity';

/**
 * The shortest time between two samples of the visible slice while the volume
 * loads. A frame that arrives shows within this time, and a long load does
 * not sample once for each of its frames.
 */
export const SAMPLED_SLICE_LOADING_UPDATE_MS = 100;

/**
 * The time without a change of the view after which the view counts as at
 * rest: 100 ms, a little more than the 80 ms of the CPU volume path, so that
 * a scroll or a zoom with a wheel, whose events come 15 to 50 ms apart, never
 * pays for a fine sample or a prefetch between two of its steps. At rest an
 * oblique slice is sampled once more per screen pixel, and the neighbours are
 * prefetched.
 */
export const SAMPLED_SLICE_REST_DELAY_MS = 100;

/**
 * The longest wait for an idle period before a prefetch runs anyway, so a
 * busy page still fills the neighbours.
 */
export const SAMPLED_SLICE_IDLE_TIMEOUT_MS = 500;

/**
 * The smallest move of the view plane along its normal that counts as a
 * scroll step, in world units.
 */
const PLANE_MOVE_TOLERANCE = 1e-6;

/** The parts of one mounted sampled slice. */
type SampledSliceMount = {
  ctx: PlanarVtkVolumeAdapterContext;
  dataId: string;
  rendering: PlanarSampledSliceRendering;
  sampler: PlanarSliceSampler;
  draw: PlanarSampledSliceActor;
  /** Cancels the pending work at rest: the rest timer or an idle prefetch. */
  cancelRestWork?: () => void;
  /** The plane of the last slice request, to find the step of a scroll. */
  lastPlane?: { normal: Point3; offset: number };
  /** The signed move along the normal of the last scroll, in world units. */
  lastStep?: number;
};

/**
 * The render path of `vtkSampledSlice`: a volume-backed display set whose
 * visible slice is cut out of the volume on the CPU and drawn as a 2D image.
 * No 3D texture is made for it.
 *
 * It wires two steps: the sample step (`PlanarSliceSampler`, plain data) and
 * the draw step (`PlanarSampledSliceActor`, the only part that knows vtk.js
 * image classes). Navigation, events, presentation and depth order follow
 * `VtkVolumeSliceRenderPath`.
 *
 * It has no acquired frames (`withAcquiredFrames`): the volume path shows them
 * in place of a reduced texture, and this path samples the full-resolution
 * voxels, so every plane, the acquisition plane too, is already exact.
 *
 * @internal
 */
export class VtkSampledSliceRenderPath
  implements RenderPath<PlanarVtkVolumeAdapterContext>
{
  async addData(
    ctx: PlanarVtkVolumeAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<PlanarDataPresentation>> {
    const payload: PlanarPayload = data as unknown as LoadedData<PlanarPayload>;
    const imageVolume = payload.imageVolume;
    const isSegmentationOverlay = isSegmentationOverlayData(payload, options);

    if (!imageVolume) {
      throw new Error(
        '[PlanarViewport] Volume rendering requires a prepared image volume'
      );
    }

    const defaultVOIRange = await getSampledSliceDefaultVOIRange(imageVolume);
    const draw = new PlanarSampledSliceActor({
      voxelManager: imageVolume.voxelManager,
      viewportId: ctx.viewportId,
    });

    draw.setClipPlanes(getVolumeClipPlanes(imageVolume));
    ctx.display.activateRenderMode(ActorRenderMode.VTK_SAMPLED_SLICE);
    ctx.vtk.renderer.addActor(draw.actor);

    const sampler = new PlanarSliceSampler();
    const rendering: PlanarSampledSliceRendering = {
      renderMode: ActorRenderMode.VTK_SAMPLED_SLICE,
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
      dataPresentation: undefined,
      isSegmentationOverlay,
      excludeFromFidelity: isSegmentationOverlay,
      fullGrid: imageVolume.voxelGrid,
      sampleDistanceLod: 1,
      getSliceCacheStatistics: () => sampler.getStatistics(),
    };
    const mount: SampledSliceMount = {
      ctx,
      dataId: data.id,
      rendering,
      sampler,
      draw,
    };

    rendering.refreshFidelity = () => refreshSampledSliceFidelity(rendering);
    rendering.refreshFidelity();
    rendering.removeStreamingSubscriptions = this.subscribeToVolumeData(
      mount,
      payload.volumeId
    );

    triggerPlanarVolumeNewImage(ctx, {
      camera: ctx.viewport.getViewState(),
      acquisitionOrientation: rendering.acquisitionOrientation,
      imageIds: rendering.imageIds,
      imageIdIndex: rendering.currentImageIdIndex,
      maxImageIdIndex: rendering.maxImageIdIndex,
    });

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(mount, props);
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
          mapper: rendering.mapper,
          renderMode: ActorRenderMode.VTK_SAMPLED_SLICE,
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
   * time point, and samples the visible slice again for each. While the
   * volume loads, the samples are at least SAMPLED_SLICE_LOADING_UPDATE_MS
   * apart. Any other change (an edit of the voxels, the end of the load, a new
   * time point) samples at the next animation frame. A change of the texture
   * limits does not concern this path, which holds no 3D texture.
   *
   * @returns the function that removes the listeners
   */
  private subscribeToVolumeData(
    mount: SampledSliceMount,
    volumeId: string
  ): () => void {
    const { rendering, sampler } = mount;
    const updates = createSampledSliceUpdates(() => {
      this.updateSlice(
        mount,
        getPlanarRenderPathActiveSourceICamera(mount.ctx)
      );
      mount.ctx.display.requestRender();
    });
    const removeVolumeSubscriptions = lifecycle.subscribeToVolumeEvents(
      volumeId,
      (eventType) => {
        if (eventType === Events.VOLUME_TEXTURE_LIMITS_CHANGED) {
          return;
        }

        sampler.invalidate();

        if (
          eventType === Events.IMAGE_VOLUME_MODIFIED &&
          isVolumeLoading(rendering.imageVolume)
        ) {
          updates.soon();
          return;
        }

        updates.now();
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
    rendering.imageVolume.load(() => {
      updates.soon();
    });

    return () => {
      updates.cancel();
      removeVolumeSubscriptions();
      eventTarget.removeEventListener(
        Events.DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED,
        onTimePointChanged
      );
    };
  }

  private updateDataPresentation(
    mount: SampledSliceMount,
    props: unknown
  ): void {
    const { ctx, draw, rendering } = mount;

    rendering.dataPresentation = props as PlanarDataPresentation | undefined;
    draw.applyPresentation(
      rendering.dataPresentation,
      rendering.isSegmentationOverlay ? undefined : rendering.defaultVOIRange
    );
    this.updateSlice(mount, getPlanarRenderPathActiveSourceICamera(ctx));
    ctx.vtk.renderer.resetCameraClippingRange();
  }

  private applyViewState(mount: SampledSliceMount, cameraInput: unknown): void {
    mount.ctx.display.activateRenderMode(ActorRenderMode.VTK_SAMPLED_SLICE);
    this.syncRenderCamera(
      mount,
      cameraInput as PlanarViewState | undefined,
      true
    );
  }

  private syncRenderCamera(
    mount: SampledSliceMount,
    camera: PlanarViewState | undefined,
    triggerImageEvent: boolean
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

    if (triggerImageEvent && imageIdIndexChanged) {
      triggerPlanarVolumeNewImage(ctx, {
        camera,
        acquisitionOrientation: rendering.acquisitionOrientation,
        imageIds: rendering.imageIds,
        imageIdIndex: rendering.currentImageIdIndex,
        maxImageIdIndex: rendering.maxImageIdIndex,
      });
    }
  }

  /**
   * Samples the slice of the camera plane, when the plane or the sampling
   * inputs changed, with pixels of about the voxel size so that a move stays
   * fast, and places the actor for the camera. The kept slice of the screen
   * grid is drawn instead when the screen grid did not move (a change of the
   * presentation). Each call is a change of the view: it cancels the work at
   * rest and starts the rest timer again.
   */
  private updateSlice(
    mount: SampledSliceMount,
    camera: PlanarResolvedICamera | undefined
  ): void {
    const { rendering, sampler } = mount;

    cancelRestWork(mount);
    recordPlaneMove(mount, camera);
    this.drawSlice(
      mount,
      camera,
      sampler.sample(
        rendering.imageVolume,
        camera,
        getPlanarSampledSliceInputs(
          rendering.imageVolume,
          rendering.dataPresentation
        ),
        getScreenGeometry(mount, camera)
      )
    );
    this.scheduleRestWork(mount);
  }

  /**
   * Draws a slice and places the actor for the camera. The source sits at
   * overlay order 0; an overlay is placed in front of it, with an order read
   * again here because a remount replaces an actor (`getSliceActorDepthOrder`).
   */
  private drawSlice(
    mount: SampledSliceMount,
    camera: PlanarResolvedICamera | undefined,
    slice: PlanarSampledSlice | undefined
  ): void {
    const { ctx, dataId, draw, rendering } = mount;

    draw.setSlice(slice);
    rendering.overlayOrder = getSliceActorDepthOrder(ctx, dataId, draw.actor);
    draw.followCamera(camera, rendering.overlayOrder);
  }

  /** Runs `onRest` once the view has not changed for SAMPLED_SLICE_REST_DELAY_MS. */
  private scheduleRestWork(mount: SampledSliceMount): void {
    const timeoutId = setTimeout(() => {
      mount.cancelRestWork = undefined;
      this.onRest(mount);
    }, SAMPLED_SLICE_REST_DELAY_MS);

    mount.cancelRestWork = () => clearTimeout(timeoutId);
  }

  /**
   * The work of a view at rest. First an oblique slice is sampled once more
   * on the screen grid, one sample per device pixel, when the sampler wants
   * that (`PlanarSliceSampler.sampleFiner`), and drawn. Then the neighbour
   * slices are prefetched in idle time, one sample per idle callback, nearest
   * first and in the direction of the last scroll first. A change of the view
   * stops it (`updateSlice`). Nothing is prefetched while the volume loads,
   * since each new frame makes the kept slices stale.
   */
  private onRest(mount: SampledSliceMount): void {
    const { ctx, rendering, sampler } = mount;
    const camera = getPlanarRenderPathActiveSourceICamera(ctx);
    const inputs = getPlanarSampledSliceInputs(
      rendering.imageVolume,
      rendering.dataPresentation
    );
    const finer = sampler.sampleFiner(
      rendering.imageVolume,
      camera,
      inputs,
      getScreenGeometry(mount, camera)
    );

    if (finer) {
      this.drawSlice(mount, camera, finer);
      ctx.display.requestRender();
    }

    if (isVolumeLoading(rendering.imageVolume)) {
      return;
    }

    const neighbours = getNeighbourCameras(mount, camera);
    const prefetchNext = () => {
      mount.cancelRestWork = undefined;

      while (neighbours.length) {
        if (
          sampler.prefetch(rendering.imageVolume, neighbours.shift(), inputs)
        ) {
          break;
        }
      }

      if (neighbours.length) {
        mount.cancelRestWork = requestIdle(prefetchNext);
      }
    };

    if (neighbours.length) {
      mount.cancelRestWork = requestIdle(prefetchNext);
    }
  }

  private removeData(mount: SampledSliceMount): void {
    cancelRestWork(mount);
    mount.rendering.removeStreamingSubscriptions?.();
    mount.draw.remove(mount.ctx.vtk.renderer);
    mount.sampler.release();
  }
}

function cancelRestWork(mount: SampledSliceMount): void {
  mount.cancelRestWork?.();
  mount.cancelRestWork = undefined;
}

/**
 * Runs a callback in idle time, with requestIdleCallback and a timeout of
 * SAMPLED_SLICE_IDLE_TIMEOUT_MS, or with setTimeout where the browser has no
 * requestIdleCallback (Safari).
 *
 * @returns the function that cancels the callback
 */
function requestIdle(callback: () => void): () => void {
  if (
    typeof requestIdleCallback === 'function' &&
    typeof cancelIdleCallback === 'function'
  ) {
    const cancelIdle = cancelIdleCallback;
    const idleId = requestIdleCallback(callback, {
      timeout: SAMPLED_SLICE_IDLE_TIMEOUT_MS,
    });

    return () => cancelIdle(idleId);
  }

  const timeoutId = setTimeout(callback, 0);

  return () => clearTimeout(timeoutId);
}

/**
 * Keeps the plane of a slice request and, when the plane moved along the
 * same normal, the signed size of that move as the last scroll step.
 */
function recordPlaneMove(
  mount: SampledSliceMount,
  camera: PlanarResolvedICamera | undefined
): void {
  if (!camera?.focalPoint || !camera.viewPlaneNormal) {
    return;
  }

  const normal = camera.viewPlaneNormal as Point3;
  const offset = vec3.dot(
    camera.focalPoint as unknown as vec3,
    normal as unknown as vec3
  );
  const { lastPlane } = mount;
  const sameNormal =
    !!lastPlane &&
    vec3.equals(lastPlane.normal as unknown as vec3, normal as unknown as vec3);

  if (!sameNormal) {
    mount.lastStep = undefined;
  } else if (Math.abs(offset - lastPlane.offset) > PLANE_MOVE_TOLERANCE) {
    mount.lastStep = offset - lastPlane.offset;
  }

  mount.lastPlane = { normal: [...normal] as Point3, offset };
}

/**
 * The screen grid of the canvas of a mount for a camera, one sample per
 * device pixel (`getScreenSliceGeometry`), or undefined for a camera without
 * a parallel scale or view up.
 */
function getScreenGeometry(
  mount: SampledSliceMount,
  camera: PlanarResolvedICamera | undefined
): VolumeSliceGeometry | undefined {
  const { canvas } = mount.ctx.vtk;

  if (!camera?.viewUp || typeof camera.parallelScale !== 'number') {
    return;
  }

  return getScreenSliceGeometry({
    camera: camera as PlanarRenderPathProjectionCamera,
    canvasWidth: canvas?.width,
    canvasHeight: canvas?.height,
  });
}

/**
 * The cameras of the neighbour planes that a scroll reaches, nearest first and
 * in the direction of the last scroll first: one step ahead, one step back,
 * two steps ahead, and so on up to SAMPLED_SLICE_PREFETCH_NEIGHBOURS.
 *
 * For the source the plane of each neighbour is resolved as a scroll resolves
 * it: the view state of the viewport with the image index of the neighbour
 * (`resolvePlanarViewportView` with `sliceIndex`), within the range of the
 * image indices. A prefetched slice is then exactly the slice of that scroll.
 * An overlay follows the camera of the source and knows neither its image
 * index nor its step, so it moves the plane by the last scroll step it saw,
 * and prefetches nothing before the first scroll.
 */
function getNeighbourCameras(
  mount: SampledSliceMount,
  camera: PlanarRenderPathProjectionCamera | undefined
): PlanarResolvedICamera[] {
  const { ctx, dataId, lastStep, rendering } = mount;

  if (!camera) {
    return [];
  }

  const direction = lastStep < 0 ? -1 : 1;
  const steps: number[] = [];

  for (let step = 1; step <= SAMPLED_SLICE_PREFETCH_NEIGHBOURS; step++) {
    steps.push(step * direction, -step * direction);
  }

  if (ctx.viewport.isCurrentDataId(dataId)) {
    const viewState = ctx.viewport.getViewState();

    return steps
      .map((step) => rendering.currentImageIdIndex + step)
      .filter((index) => index >= 0 && index <= rendering.maxImageIdIndex)
      .map((sliceIndex) =>
        resolvePlanarViewportView({
          viewState,
          rendering,
          renderContext: ctx,
          sliceIndex,
        })?.toICamera()
      )
      .filter(Boolean);
  }

  if (!lastStep) {
    return [];
  }

  const stepSize = Math.abs(lastStep);

  return steps.map((step) => ({
    ...camera,
    focalPoint: vec3.scaleAndAdd(
      [0, 0, 0] as unknown as vec3,
      camera.focalPoint as unknown as vec3,
      camera.viewPlaneNormal as unknown as vec3,
      step * stepSize
    ) as unknown as Point3,
  }));
}

/** @internal */
export class VtkSampledSlicePath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarVtkVolumeAdapterContext
    >
{
  readonly id = 'planar:vtk-sampled-slice';
  readonly type = ViewportType.PLANAR_NEXT;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return (
      data.type === 'image' &&
      options.renderMode === ActorRenderMode.VTK_SAMPLED_SLICE
    );
  }

  createRenderPath() {
    return new VtkSampledSliceRenderPath();
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
 * The default VOI of a sampled slice. It is the default VOI of the volume
 * path (`getDefaultVolumeVOIRange`: the VOI of the metadata, else the range of
 * the middle image, 0 to 5 for a PT in SUV). Where that gives nothing, the
 * volume path keeps no transfer function and its actor shows the voxel range
 * of the volume (see `createVolumeSliceActor`), so the voxel range is the
 * default here.
 */
export async function getSampledSliceDefaultVOIRange(
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
 * path, and a later delivery replaces the data while the volume loads.
 */
function refreshSampledSliceFidelity(
  rendering: PlanarSampledSliceRendering
): void {
  rendering.voxelQuality = rendering.imageVolume.getVoxelQuality?.();
  rendering.qualityPending = isVolumeLoading(rendering.imageVolume);
  rendering.fullGrid = rendering.imageVolume.voxelGrid;
}

/**
 * Coalesces the samples that volume data asks for. `now` samples at the next
 * animation frame; `soon` samples at the next animation frame after at least
 * SAMPLED_SLICE_LOADING_UPDATE_MS since the last sample; a pending sample
 * takes any later request.
 */
function createSampledSliceUpdates(update: () => void): {
  now: () => void;
  soon: () => void;
  cancel: () => void;
} {
  let frameId: number | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let lastUpdateTime = -Infinity;

  const runUpdate = () => {
    frameId = undefined;
    lastUpdateTime = performance.now();
    update();
  };
  const now = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }

    if (frameId === undefined) {
      frameId = requestAnimationFrame(runUpdate);
    }
  };
  const soon = () => {
    if (frameId !== undefined || timeoutId !== undefined) {
      return;
    }

    const delay = Math.max(
      0,
      SAMPLED_SLICE_LOADING_UPDATE_MS - (performance.now() - lastUpdateTime)
    );

    if (delay === 0) {
      now();
      return;
    }

    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      now();
    }, delay);
  };
  const cancel = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }

    if (frameId !== undefined) {
      cancelAnimationFrame(frameId);
      frameId = undefined;
    }
  };

  return { now, soon, cancel };
}
