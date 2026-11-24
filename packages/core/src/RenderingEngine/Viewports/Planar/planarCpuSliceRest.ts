import { vec3 } from 'gl-matrix';
import type { IImageVolume, Point3 } from '../../../types';
import type { VolumeSliceGeometry } from '../../../utilities/volumeSliceGeometry';
import type {
  PlanarCpuVolumeAdapterContext,
  PlanarResolvedICamera,
  PlanarVtkVolumeAdapterContext,
} from './PlanarViewportTypes';
import type { PlanarRendering } from './planarRuntimeTypes';
import type { PlanarRenderPathProjectionCamera } from './planarRenderPathProjection';
import { resolvePlanarViewportView } from './PlanarResolvedView';
import {
  CPU_SLICE_PREFETCH_NEIGHBOURS,
  getScreenSliceGeometry,
} from './planarCpuSlice';
import type {
  PlanarCpuSlice,
  PlanarCpuSliceInputs,
  PlanarSliceSampler,
} from './planarCpuSlice';
import { isVolumeLoading } from '../renderingFidelity';

/**
 * The time without a change of the view after which the view counts as at
 * rest: 100 ms, a little more than the 80 ms of the CPU volume path, so that
 * a scroll or a zoom with a wheel, whose events come 15 to 50 ms apart, never
 * pays for a fine sample or a prefetch between two of its steps. At rest an
 * oblique slice is sampled once more per screen pixel, and the neighbours are
 * prefetched.
 */
export const CPU_SLICE_REST_DELAY_MS = 100;

/**
 * The longest wait for an idle period before a prefetch runs anyway, so a
 * busy page still fills the neighbours.
 */
export const CPU_SLICE_IDLE_TIMEOUT_MS = 500;

/**
 * The work of one step of a slab sampled in steps, in milliseconds: 12 ms per
 * animation frame, so a frame of 16.7 ms keeps time to draw.
 */
export const CPU_SLICE_STEP_MS = 12;

/**
 * The smallest move of the view plane along its normal that counts as a
 * scroll step, in world units.
 */
const PLANE_MOVE_TOLERANCE = 1e-6;

/** The context of a render path that draws a sampled slice. */
export type PlanarCpuSliceContext =
  | PlanarCpuVolumeAdapterContext
  | PlanarVtkVolumeAdapterContext;

/** The plane of the last slice request and the step of the last scroll. */
export type PlanarSlicePlaneMoves = {
  lastPlane?: { normal: Point3; offset: number };
  /** The signed move along the normal of the last scroll, in world units. */
  lastStep?: number;
};

/**
 * Keeps the plane of a slice request and, when the plane moved along the
 * same normal, the signed size of that move as the last scroll step.
 */
export function recordPlaneMove(
  moves: PlanarSlicePlaneMoves,
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
  const { lastPlane } = moves;
  const sameNormal =
    !!lastPlane &&
    vec3.equals(lastPlane.normal as unknown as vec3, normal as unknown as vec3);

  if (!sameNormal) {
    moves.lastStep = undefined;
  } else if (Math.abs(offset - lastPlane.offset) > PLANE_MOVE_TOLERANCE) {
    moves.lastStep = offset - lastPlane.offset;
  }

  moves.lastPlane = { normal: [...normal] as Point3, offset };
}

/**
 * Runs a callback in idle time, with requestIdleCallback and a timeout of
 * CPU_SLICE_IDLE_TIMEOUT_MS, or with setTimeout where the browser has no
 * requestIdleCallback (Safari).
 *
 * @returns the function that cancels the callback
 */
export function requestIdle(callback: () => void): () => void {
  if (
    typeof requestIdleCallback === 'function' &&
    typeof cancelIdleCallback === 'function'
  ) {
    const cancelIdle = cancelIdleCallback;
    const idleId = requestIdleCallback(callback, {
      timeout: CPU_SLICE_IDLE_TIMEOUT_MS,
    });

    return () => cancelIdle(idleId);
  }

  const timeoutId = setTimeout(callback, 0);

  return () => clearTimeout(timeoutId);
}

/**
 * The screen grid of a canvas for a camera, one sample per device pixel
 * (`getScreenSliceGeometry`) up to `maxSize` samples along a side, or
 * undefined for a camera without a parallel scale or view up.
 */
export function getCanvasScreenSliceGeometry(
  canvas: Pick<HTMLCanvasElement, 'width' | 'height'> | undefined,
  camera: PlanarResolvedICamera | undefined,
  maxSize?: number
): VolumeSliceGeometry | undefined {
  if (!camera?.viewUp || typeof camera.parallelScale !== 'number') {
    return;
  }

  return getScreenSliceGeometry({
    camera: camera as PlanarRenderPathProjectionCamera,
    canvasWidth: canvas?.width,
    canvasHeight: canvas?.height,
    maxSize,
  });
}

/**
 * The cameras of the neighbour planes that a scroll reaches, nearest first and
 * in the direction of the last scroll first: one step ahead, one step back,
 * two steps ahead, and so on up to CPU_SLICE_PREFETCH_NEIGHBOURS.
 *
 * For the source the plane of each neighbour is resolved as a scroll resolves
 * it: the view state of the viewport with the image index of the neighbour
 * (`resolvePlanarViewportView` with `sliceIndex`), within the range of the
 * image indices. A prefetched slice is then exactly the slice of that scroll.
 * An overlay follows the camera of the source and knows neither its image
 * index nor its step, so it moves the plane by the last scroll step it saw,
 * and prefetches nothing before the first scroll.
 */
export function getNeighbourCameras(args: {
  ctx: PlanarCpuSliceContext;
  displaySetId: string;
  rendering: PlanarRendering & {
    currentImageIdIndex: number;
    maxImageIdIndex: number;
  };
  lastStep: number | undefined;
  camera: PlanarResolvedICamera | undefined;
}): PlanarResolvedICamera[] {
  const { ctx, displaySetId, lastStep, rendering, camera } = args;

  if (!camera?.focalPoint || !camera.viewPlaneNormal) {
    return [];
  }

  const direction = lastStep < 0 ? -1 : 1;
  const steps: number[] = [];

  for (let step = 1; step <= CPU_SLICE_PREFETCH_NEIGHBOURS; step++) {
    steps.push(step * direction, -step * direction);
  }

  if (ctx.viewport.isCurrentDisplaySetId(displaySetId)) {
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

/**
 * Runs the steps of a slab that a sampler samples in steps
 * (`PlanarSliceSampler.continueSampling`), CPU_SLICE_STEP_MS of work per
 * animation frame, until none is left. `onSlice` gets the slab when it is
 * done, and `onDone` runs after the last step.
 *
 * @returns the function that cancels the steps that remain
 */
export function runCpuSliceSteps(args: {
  sampler: PlanarSliceSampler;
  volume: IImageVolume;
  onSlice: (slice: PlanarCpuSlice) => void;
  onDone: () => void;
}): () => void {
  const { sampler, volume } = args;
  let cancelled = false;
  let frameId = requestAnimationFrame(function step() {
    if (cancelled) {
      return;
    }

    const slice = sampler.continueSampling(
      volume,
      performance.now() + CPU_SLICE_STEP_MS
    );

    if (slice) {
      args.onSlice(slice);
    }

    if (cancelled) {
      return;
    }

    if (sampler.hasPendingSteps()) {
      frameId = requestAnimationFrame(step);
    } else {
      args.onDone();
    }
  });

  return () => {
    cancelled = true;
    cancelAnimationFrame(frameId);
  };
}

/**
 * Starts the work of a view at rest: it runs once the view has not changed
 * for CPU_SLICE_REST_DELAY_MS. First the steps of a slab that the sampler
 * samples in steps run (`runCpuSliceSteps`), and `onFinerSlice` draws the
 * slab when it is done. Then the slice on screen is sampled once more on the
 * screen grid when the sampler wants that (`PlanarSliceSampler.sampleFiner`),
 * at once or in steps, and `onFinerSlice` draws it. Then the neighbour slices
 * are prefetched in idle time, one sample per idle callback, in the order of
 * `getNeighbours`. Nothing is prefetched while the volume loads, since each
 * new frame makes the kept slices stale. Each request reads the camera, the
 * inputs and the screen grid at the time it runs. `onStateChange` runs after
 * each part, so the caller can read the state of the sampler. Once the work
 * is cancelled, no part of it runs or schedules more, also when the cancel
 * comes from `onFinerSlice`.
 *
 * @returns the function that cancels the pending work
 */
export function scheduleCpuSliceRestWork(args: {
  sampler: PlanarSliceSampler;
  volume: IImageVolume;
  getCamera: () => PlanarResolvedICamera | undefined;
  getInputs: () => PlanarCpuSliceInputs;
  getScreen: (
    camera: PlanarResolvedICamera | undefined
  ) => VolumeSliceGeometry | undefined;
  getNeighbours: (
    camera: PlanarResolvedICamera | undefined
  ) => PlanarResolvedICamera[];
  onFinerSlice: (slice: PlanarCpuSlice) => void;
  onStateChange?: () => void;
}): () => void {
  const { sampler, volume } = args;
  let cancelPending: () => void;
  let cancelled = false;
  const prefetch = (
    neighbours: PlanarResolvedICamera[],
    inputs: PlanarCpuSliceInputs
  ) => {
    if (cancelled) {
      return;
    }

    while (neighbours.length) {
      if (sampler.prefetch(volume, neighbours.shift(), inputs)) {
        break;
      }
    }

    cancelPending = neighbours.length
      ? requestIdle(() => prefetch(neighbours, inputs))
      : () => undefined;
  };
  const onRest = () => {
    if (cancelled) {
      return;
    }

    if (sampler.hasPendingSteps()) {
      cancelPending = runCpuSliceSteps({
        sampler,
        volume,
        onSlice: args.onFinerSlice,
        onDone: () => {
          args.onStateChange?.();
          onRest();
        },
      });

      return;
    }

    const camera = args.getCamera();
    const inputs = args.getInputs();
    const finer = sampler.sampleFiner(
      volume,
      camera,
      inputs,
      args.getScreen(camera)
    );

    cancelPending = () => undefined;

    if (finer) {
      args.onFinerSlice(finer);
    }

    args.onStateChange?.();

    if (cancelled) {
      return;
    }

    if (sampler.hasPendingSteps()) {
      onRest();

      return;
    }

    if (isVolumeLoading(volume)) {
      return;
    }

    const neighbours = args.getNeighbours(camera);

    if (neighbours.length) {
      cancelPending = requestIdle(() => prefetch(neighbours, inputs));
    }
  };
  const timeoutId = setTimeout(onRest, CPU_SLICE_REST_DELAY_MS);

  cancelPending = () => clearTimeout(timeoutId);

  return () => {
    cancelled = true;
    cancelPending();
  };
}
