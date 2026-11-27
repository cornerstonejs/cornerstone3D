import type {
  GpuMemoryLimit,
  GpuMemoryLimitSource,
} from '../utilities/gpuSettingsPresets';
import type { RendererClass } from '../utilities/renderingCapabilities';

/**
 * Why new WebGL contexts and large GPU allocations wait:
 *
 * - `chrome`: Chromium blocks WebGL for this site after repeated context
 *   losses, for about two minutes.
 * - `cooldown`: a second GPU memory failure within two minutes, in any tab of
 *   this site, starts a wait of two minutes in browsers that do not block.
 * - `calibration`: a calibration run allocates until the GPU fails, so the
 *   other tabs wait for it.
 */
type WebGLBlockReason = 'chrome' | 'cooldown' | 'calibration';

/**
 * How a GPU memory failure showed. All of them happen during a large
 * allocation:
 *
 * - `contextLost`: the WebGL context was lost. The page must reload once
 *   WebGL is available again.
 * - `crash`: the tab stopped during the allocation, and the next start found
 *   its pending record.
 * - `outOfMemory`: `getError()` reported `OUT_OF_MEMORY`, and the context
 *   stays alive (Firefox).
 */
type GpuMemoryFailureKind = 'contextLost' | 'crash' | 'outOfMemory';

/** The GPU memory of `auto` now. See `getGpuMemoryStatus`. */
type GpuMemoryStatus = {
  /**
   * True when the GPU settings apply: a WebGL GPU that is not a software
   * renderer, and no CPU rendering. With false, no limit applies and the
   * limit fields are absent.
   */
  applies: boolean;
  /** The memory limit of the page, in GPU bytes. */
  limitBytes?: number;
  /** Where the limit comes from. */
  source?: GpuMemoryLimitSource;
  /** True when the limit is a hard limit, from the configuration or the user. */
  hard: boolean;
  /** The start of the device, which applies while nothing else sets a limit. */
  startBytes?: number;
  rendererClass: RendererClass;
  /** The GPU bytes that the page holds now, from the memory ledger. */
  pageBytes: number;
  /** True when a failure happened at or below 128 MB, so no GPU size works. */
  noGpuSizeWorks: boolean;
  /** True when the application should offer CPU rendering to the user. */
  cpuRecommended: boolean;
  /** True when a calibration run may start. See `canRunGpuMemoryCalibration`. */
  canCalibrate: boolean;
  /** True while new WebGL contexts and large allocations wait. */
  webglBlocked: boolean;
  /** When the wait ends, in milliseconds since the epoch, when known. */
  webglBlockedUntil?: number;
  webglBlockReason?: WebGLBlockReason;
};

/**
 * The successes and the failures of one size range of the page. A load goes
 * in the smallest bucket whose `gb` is at least the load. The last bucket,
 * with `gb` of `Number.POSITIVE_INFINITY`, holds every load above the largest
 * size of `GPU_MEMORY_BUCKETS_GB`.
 */
type GpuMemoryBucket = {
  gb: number;
  successes: number;
  failures: number;
};

/** The largest size that worked, and how often it worked. */
type GpuMemoryLargestSuccess = {
  bytes: number;
  successes: number;
};

/** The result of a calibration run. See `runGpuMemoryCalibration`. */
type GpuMemoryCalibration = {
  /** The largest texture memory that worked, in bytes. */
  largestSuccessBytes: number;
  /** The size of the step that failed, when the run reached a failure. */
  failedBytes?: number;
  /** When the run ended, in milliseconds since the epoch. */
  at: number;
};

/** One GPU memory failure, as the record keeps it. */
type GpuMemoryFailure = {
  kind: GpuMemoryFailureKind;
  /** When the failure happened, in milliseconds since the epoch. */
  at: number;
  /** The GPU bytes of the page at the failure. */
  failedBytes: number;
  /** The allocation that failed, in bytes, when known. */
  textureBytes?: number;
  /** The limit in force. A failure does not change it. */
  limitBytes: number;
  limitSource: GpuMemoryLimitSource;
};

/**
 * What the record holds about the GPU memory of this device: the sizes that
 * worked and failed, the largest successes, the last failure and the last
 * calibration. The application shows it in its memory dialog. Nothing in it
 * changes the limit. See `getGpuMemoryHistory`.
 */
type GpuMemoryHistory = {
  buckets: GpuMemoryBucket[];
  /** The largest page total that worked. */
  largestLoad?: GpuMemoryLargestSuccess;
  /** The largest single texture that worked. */
  largestTexture?: GpuMemoryLargestSuccess;
  lastFailure?: GpuMemoryFailure;
  calibration?: GpuMemoryCalibration;
};

/** The options of `runGpuMemoryCalibration`. */
type RunGpuMemoryCalibrationOptions = {
  /** The size of the first step, in bytes. */
  startBytes?: number;
  /** The growth of each step, in bytes. */
  stepBytes?: number;
};

/**
 * The detail of `GPU_MEMORY_FAILURE`: the failure, and what the application
 * needs to show the user and to choose what comes next.
 */
type GpuMemoryFailureEventDetail = GpuMemoryFailure & {
  /** How often a page total at or above the failed size worked. */
  successesAtOrAboveFailed: number;
  /** How often a page total at or above the failed size failed, this one included. */
  failuresAtOrAboveFailed: number;
  /**
   * True when the failed size worked several times before and this is its
   * first failure. The suggestion then keeps the current limit.
   */
  oneOff: boolean;
  largestSuccessBytes?: number;
  largestSuccessCount?: number;
  /** The limit to offer the user. Cornerstone3D does not apply it. */
  suggestedBytes: number;
  canCalibrate: boolean;
  /** True when the page must reload once WebGL is available again. */
  mustReload: boolean;
  noGpuSizeWorks: boolean;
  webglBlockedUntil?: number;
  renderingEngineId?: string;
  contextIndex?: number;
  history: GpuMemoryHistory;
};

/** The detail of `GPU_MEMORY_LIMIT_CHANGED`. */
type GpuMemoryLimitChangedEventDetail = {
  /** The limit before the change, or `undefined` when no limit applied. */
  previous?: GpuMemoryLimit;
  /** The limit after the change, or `undefined` when no limit applies. */
  current?: GpuMemoryLimit;
};

/** The detail of `GPU_MEMORY_CALIBRATED`. */
type GpuMemoryCalibratedEventDetail = GpuMemoryCalibration;

/** The detail of `WEBGL_AVAILABILITY_CHANGED`. */
type WebGLAvailabilityChangedEventDetail = {
  blocked: boolean;
  /** When the wait ends, in milliseconds since the epoch, when known. */
  until?: number;
  reason?: WebGLBlockReason;
  /** `self` when this tab started or ended the wait, `other` for another tab. */
  sourceTab: 'self' | 'other';
};

export type {
  WebGLBlockReason,
  GpuMemoryFailureKind,
  GpuMemoryStatus,
  GpuMemoryBucket,
  GpuMemoryLargestSuccess,
  GpuMemoryCalibration,
  GpuMemoryFailure,
  GpuMemoryHistory,
  RunGpuMemoryCalibrationOptions,
  GpuMemoryFailureEventDetail,
  GpuMemoryLimitChangedEventDetail,
  GpuMemoryCalibratedEventDetail,
  WebGLAvailabilityChangedEventDetail,
};
