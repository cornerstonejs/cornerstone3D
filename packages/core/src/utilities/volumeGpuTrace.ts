/**
 * Temporary instrumentation for tracing GPU / streaming cost when volumes
 * exceed the 2048 texture edge (reduced-resolution full-extent path).
 *
 * Enable any of:
 *   - `utilities.enableVolumeGpuTrace()` (this page load only)
 *   - URL query `?volumeGpuTrace=1`
 *
 * Amplifier isolation (same enable call or URL):
 *   - `skipNearbyFrames: true` / `?volumeGpuTraceSkipNearby=1`
 *     skips progressive nearby-frame copies that also call successCallback
 *   - `setActiveGpuCapabilityProfile('high-texture-4096')` forces full-res
 *     for depths ≤ 4096 so you can A/B against the reduced path
 *
 * A/B pacing overrides (this page load, or URL):
 *   - `setVolumeGpuExperimentOptions({ maxDirtySlices, volumeModifiedThrottleMs })`
 *   - `?volumeGpuMaxDirtySlices=8` / `?volumeModifiedThrottleMs=50`
 *
 * After a load: `utilities.dumpVolumeGpuTrace()` prints a summary. Healthy
 * reduced streaming shows ~1 dirty texture slice per frame, upload branch
 * `derived`, and `mapperReset` only on first alloc (not every frame).
 */

export type VolumeGpuTraceKind =
  | 'markFrameDirty'
  | 'refreshDerived'
  | 'setUpdatedFrame'
  | 'upload'
  | 'mapperAlloc'
  | 'requestRender';

export type VolumeGpuUploadBranch =
  | 'derived'
  | 'fillSliceByBoxAverage'
  | 'fillGrid'
  | 'voxelManager'
  | 'dynamic'
  | 'none';

export type VolumeGpuTraceEvent = {
  kind: VolumeGpuTraceKind;
  t: number;
  volumeId?: string;
  frameIndex?: number;
  textureSets?: number;
  mappedSlices?: number;
  dirtyAlready?: number;
  sliceIndex?: number;
  /** Texture K preferred for capped uploads (viewport/center). */
  preferredSlice?: number;
  durationMs?: number;
  branch?: VolumeGpuUploadBranch;
  dirtySlicesUploaded?: number;
  texSubImageW?: number;
  texSubImageH?: number;
  texSubImageDepth?: number;
  shouldReset?: boolean;
  dims?: [number, number, number];
};

export type VolumeGpuTraceOptions = {
  /** When true, `fillNearbyFrames` is a no-op. */
  skipNearbyFrames?: boolean;
  /** Log a rolling summary every N recorded events (0 = never). Default 50. */
  logEvery?: number;
  /** Cap retained events. Default 2000. Use Infinity to retain all. */
  maxEvents?: number;
};

type InternalOptions = {
  skipNearbyFrames: boolean;
  logEvery: number;
  maxEvents: number;
};

let enabled = false;
let options: InternalOptions = {
  skipNearbyFrames: false,
  logEvery: 50,
  maxEvents: 2000,
};
const events: VolumeGpuTraceEvent[] = [];
const origin =
  typeof performance !== 'undefined' && performance.now
    ? () => performance.now()
    : () => Date.now();
const startMs = origin();

/** Default cap of dirty texture slices uploaded per paint. */
export const DEFAULT_MAX_DIRTY_SLICES_PER_UPLOAD = 16;

/** Default throttle for legacy GPU volume IMAGE_VOLUME_MODIFIED paints (ms). */
export const DEFAULT_VOLUME_MODIFIED_THROTTLE_MS = 1000;

export type VolumeGpuExperimentOptions = {
  /**
   * Max texSubImage3D slices per upload. Use Infinity / a huge number to
   * disable the cap for A/B. Undefined = default (or URL).
   */
  maxDirtySlices?: number;
  /**
   * Throttle for legacy BaseVolumeViewport IMAGE_VOLUME_MODIFIED paints.
   * Independent of cpuVolume.volumeModifiedThrottleMs. Undefined = default
   * (or URL).
   */
  volumeModifiedThrottleMs?: number;
};

let experimentOptions: VolumeGpuExperimentOptions = {};

function readUrlFlag(name: string): boolean {
  try {
    if (typeof location === 'undefined') {
      return false;
    }
    return new URLSearchParams(location.search).get(name) === '1';
  } catch {
    return false;
  }
}

function readUrlNumber(name: string): number | undefined {
  try {
    if (typeof location === 'undefined') {
      return undefined;
    }
    const raw = new URLSearchParams(location.search).get(name);
    if (raw == null || raw === '') {
      return undefined;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sets pacing overrides for A/B (this page load). Pass `{}` / omit a field to
 * clear that override and fall back to URL then default.
 */
export function setVolumeGpuExperimentOptions(
  next: VolumeGpuExperimentOptions = {}
): VolumeGpuExperimentOptions {
  experimentOptions = { ...next };
  // eslint-disable-next-line no-console
  console.info(
    '[volumeGpuTrace] experiment options',
    getVolumeGpuExperimentOptions()
  );
  return getVolumeGpuExperimentOptions();
}

/** Resolved pacing options (runtime override → URL → default). */
export function getVolumeGpuExperimentOptions(): Required<VolumeGpuExperimentOptions> {
  const maxDirtySlices =
    experimentOptions.maxDirtySlices ??
    readUrlNumber('volumeGpuMaxDirtySlices') ??
    DEFAULT_MAX_DIRTY_SLICES_PER_UPLOAD;
  const volumeModifiedThrottleMs =
    experimentOptions.volumeModifiedThrottleMs ??
    readUrlNumber('volumeModifiedThrottleMs') ??
    DEFAULT_VOLUME_MODIFIED_THROTTLE_MS;

  return { maxDirtySlices, volumeModifiedThrottleMs };
}

function syncEnabledFromEnvironment(): void {
  if (enabled) {
    return;
  }
  // URL only — do not sticky-enable from localStorage so a prior debug session
  // does not keep logging on every later visit without the query param.
  if (readUrlFlag('volumeGpuTrace')) {
    enableVolumeGpuTrace({
      skipNearbyFrames: readUrlFlag('volumeGpuTraceSkipNearby'),
    });
  }
}

export function isVolumeGpuTraceEnabled(): boolean {
  syncEnabledFromEnvironment();
  return enabled;
}

export function shouldSkipNearbyFramesForTrace(): boolean {
  syncEnabledFromEnvironment();
  return enabled && options.skipNearbyFrames;
}

/**
 * Starts recording. Safe to call repeatedly; resets counters only via
 * `resetVolumeGpuTrace`. Active for this page load only (not persisted).
 */
export function enableVolumeGpuTrace(next: VolumeGpuTraceOptions = {}): void {
  enabled = true;
  options = {
    skipNearbyFrames: Boolean(next.skipNearbyFrames),
    logEvery: next.logEvery ?? 50,
    maxEvents: next.maxEvents ?? 2000,
  };

  // eslint-disable-next-line no-console
  console.info(
    '[volumeGpuTrace] enabled',
    options.skipNearbyFrames ? '(skipNearbyFrames)' : ''
  );
}

export function disableVolumeGpuTrace(): void {
  enabled = false;
}

export function resetVolumeGpuTrace(): void {
  events.length = 0;
}

export function getVolumeGpuTraceEvents(): readonly VolumeGpuTraceEvent[] {
  return events;
}

/**
 * Records one hot-path sample. No-op when tracing is off.
 * Uses `performance.mark` when available so Chrome Performance can correlate.
 */
export function recordVolumeGpuTrace(
  partial: Omit<VolumeGpuTraceEvent, 't'> & { t?: number }
): void {
  if (!isVolumeGpuTraceEnabled()) {
    return;
  }

  const event: VolumeGpuTraceEvent = {
    ...partial,
    t: partial.t ?? origin() - startMs,
  };

  events.push(event);
  if (events.length > options.maxEvents) {
    events.splice(0, events.length - options.maxEvents);
  }

  try {
    if (typeof performance !== 'undefined' && performance.mark) {
      try {
        performance.mark(`cs3d:volumeGpuTrace:${event.kind}`, {
          detail: event,
        });
      } catch {
        // Some browsers reject the detail option on performance.mark.
        performance.mark(`cs3d:volumeGpuTrace:${event.kind}`);
      }
    }
  } catch {
    // performance.mark unavailable or rejected entirely
  }

  if (options.logEvery > 0 && events.length % options.logEvery === 0) {
    // eslint-disable-next-line no-console
    console.info('[volumeGpuTrace] rolling', summarizeVolumeGpuTrace());
  }
}

export type VolumeGpuTraceSummary = {
  eventCount: number;
  byKind: Record<string, number>;
  markFrameDirty: {
    count: number;
    avgTextureSets: number;
    avgMappedSlices: number;
    maxMappedSlices: number;
  };
  refreshDerived: {
    count: number;
    totalMs: number;
    avgMs: number;
    maxMs: number;
  };
  setUpdatedFrame: {
    count: number;
    avgDirtyAlready: number;
    maxDirtyAlready: number;
  };
  upload: {
    count: number;
    byBranch: Record<string, number>;
    totalMs: number;
    avgMs: number;
    maxMs: number;
    avgDirtySlices: number;
    maxDirtySlices: number;
    totalTexels: number;
  };
  mapperAlloc: {
    count: number;
    resetCount: number;
  };
  requestRender: {
    count: number;
  };
  /** Heuristic labels for Phase 5. */
  hypotheses: string[];
};

function avg(sum: number, n: number): number {
  return n ? sum / n : 0;
}

/** Aggregate counters for console / A/B comparison. */
export function summarizeVolumeGpuTrace(): VolumeGpuTraceSummary {
  const byKind: Record<string, number> = {};
  let markCount = 0;
  let markSets = 0;
  let markMapped = 0;
  let markMappedMax = 0;
  let refreshCount = 0;
  let refreshMs = 0;
  let refreshMax = 0;
  let setCount = 0;
  let setDirtySum = 0;
  let setDirtyMax = 0;
  let uploadCount = 0;
  const byBranch: Record<string, number> = {};
  let uploadMs = 0;
  let uploadMax = 0;
  let uploadDirtySum = 0;
  let uploadDirtyMax = 0;
  let totalTexels = 0;
  let mapperCount = 0;
  let resetCount = 0;
  let requestRenderCount = 0;

  for (const e of events) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;

    if (e.kind === 'markFrameDirty') {
      markCount++;
      markSets += e.textureSets ?? 0;
      const mapped = e.mappedSlices ?? 0;
      markMapped += mapped;
      markMappedMax = Math.max(markMappedMax, mapped);
    } else if (e.kind === 'refreshDerived') {
      refreshCount++;
      const ms = e.durationMs ?? 0;
      refreshMs += ms;
      refreshMax = Math.max(refreshMax, ms);
    } else if (e.kind === 'setUpdatedFrame') {
      setCount++;
      const dirtyAlready = e.dirtyAlready ?? 0;
      setDirtySum += dirtyAlready;
      setDirtyMax = Math.max(setDirtyMax, dirtyAlready);
    } else if (e.kind === 'upload') {
      uploadCount++;
      const branch = e.branch ?? 'none';
      byBranch[branch] = (byBranch[branch] || 0) + 1;
      const ms = e.durationMs ?? 0;
      uploadMs += ms;
      uploadMax = Math.max(uploadMax, ms);
      const dirtySlicesUploaded = e.dirtySlicesUploaded ?? 0;
      uploadDirtySum += dirtySlicesUploaded;
      uploadDirtyMax = Math.max(uploadDirtyMax, dirtySlicesUploaded);
      const texSubImageW = e.texSubImageW ?? 0;
      const texSubImageH = e.texSubImageH ?? 0;
      const texSubImageDepth = e.texSubImageDepth ?? 1;
      totalTexels +=
        texSubImageW * texSubImageH * texSubImageDepth * dirtySlicesUploaded;
    } else if (e.kind === 'mapperAlloc') {
      mapperCount++;
      if (e.shouldReset) {
        resetCount++;
      }
    } else if (e.kind === 'requestRender') {
      requestRenderCount++;
    }
  }

  const hypotheses: string[] = [];
  if (uploadDirtyMax > 8) {
    hypotheses.push(
      'full-dirty: uploads mark many texture slices per call (modified/markAllDirty?)'
    );
  }
  if ((byBranch.fillSliceByBoxAverage || 0) > (byBranch.derived || 0)) {
    hypotheses.push(
      'derived-miss: fillSliceByBoxAverage dominates over derived subarray path'
    );
  }
  if (avg(markSets, markCount) > 1.5) {
    hypotheses.push(
      'multi-set: markFrameDirty averages more than one texture set per frame'
    );
  }
  if (resetCount > 2) {
    hypotheses.push(
      'texture-reset: mapper shouldReset true repeatedly (re-alloc thrash)'
    );
  }
  if (
    requestRenderCount > markCount * 1.5 &&
    avg(uploadMs, uploadCount) < 5 &&
    markCount > 10
  ) {
    hypotheses.push(
      'render-storm: many requestRender vs cheap uploads (draw cost, not texSubImage)'
    );
  }
  if (avg(refreshMs, refreshCount) > 5) {
    hypotheses.push(
      'derived-refresh-cpu: refreshDerivedFrames avg >5ms (CPU may look like GPU)'
    );
  }
  if (!hypotheses.length && markCount) {
    hypotheses.push(
      'healthy-ish: no smoking gun in counters; compare ≤2048 vs >2048 with dumpVolumeGpuTrace'
    );
  }

  return {
    eventCount: events.length,
    byKind,
    markFrameDirty: {
      count: markCount,
      avgTextureSets: avg(markSets, markCount),
      avgMappedSlices: avg(markMapped, markCount),
      maxMappedSlices: markMappedMax,
    },
    refreshDerived: {
      count: refreshCount,
      totalMs: refreshMs,
      avgMs: avg(refreshMs, refreshCount),
      maxMs: refreshMax,
    },
    setUpdatedFrame: {
      count: setCount,
      avgDirtyAlready: avg(setDirtySum, setCount),
      maxDirtyAlready: setDirtyMax,
    },
    upload: {
      count: uploadCount,
      byBranch,
      totalMs: uploadMs,
      avgMs: avg(uploadMs, uploadCount),
      maxMs: uploadMax,
      avgDirtySlices: avg(uploadDirtySum, uploadCount),
      maxDirtySlices: uploadDirtyMax,
      totalTexels,
    },
    mapperAlloc: {
      count: mapperCount,
      resetCount,
    },
    requestRender: {
      count: requestRenderCount,
    },
    hypotheses,
  };
}

export function dumpVolumeGpuTrace(): VolumeGpuTraceSummary {
  const summary = summarizeVolumeGpuTrace();
  // eslint-disable-next-line no-console
  console.info('[volumeGpuTrace] summary', summary);
  // eslint-disable-next-line no-console
  console.info(
    '[volumeGpuTrace] hypotheses:\n - ' + summary.hypotheses.join('\n - ')
  );
  return summary;
}

/**
 * How to A/B profile in Chrome / Spector. Call once after enabling trace.
 */
export function printVolumeGpuTracePlaybook(): void {
  // eslint-disable-next-line no-console
  console.info(`[volumeGpuTrace] playbook
1. Load a volume with depth ≤2048, resetVolumeGpuTrace(), dump after partial load.
2. Load depth >2048 (same in-plane). Expect texture set reduced-1x1xN/full-extent/average.
3. Chrome Performance: filter marks cs3d:volumeGpuTrace:*.
4. Spector.js: count texSubImage3D; size should be W×H×1 per dirty slice.
5. Amplifiers:
   - enableVolumeGpuTrace({ skipNearbyFrames: true })
   - setActiveGpuCapabilityProfile('high-texture-4096') then reload
   - single MPR viewport vs three
6. Compare dumpVolumeGpuTrace() summaries; hypotheses[] names the smoking gun.`);
}
