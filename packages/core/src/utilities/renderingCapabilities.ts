import type {
  ProbeTextureFormat,
  TextureFormatSupport,
} from './textureSupport';
import {
  probeEdgeSearch,
  probeRenderingLimits,
  probeTextureEdge,
} from './textureSupport';
import { getCapabilityStorage } from './capabilityStorage';
import { coreLog } from './logger';
import uuidv4 from './uuidv4';

const log = coreLog.getLogger('utilities', 'renderingCapabilities');

/**
 * Bump when the probes (or the meaning of any profile field) change so that
 * profiles cached by earlier versions are discarded.
 *
 * Version 2 probes 3D textures, and adds the edge and the memory records.
 */
export const RENDERING_CAPABILITIES_PROBE_VERSION = 2;

const STORAGE_KEY = 'cornerstone3D.renderingCapabilities';
const PENDING_KEY_PREFIX = `${STORAGE_KEY}.pending.`;

/** The edge that the first probe tests. */
const SAFE_PROBE_EDGE = 2048;

/**
 * A pending record younger than this can belong to a tab that still runs its
 * allocation, so the startup scan leaves it for a later start.
 */
const PENDING_STALE_MS = 10000;

const SOFTWARE_RASTERIZER_PATTERN =
  /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;

const MOBILE_RENDERER_PATTERN =
  /mali|adreno|powervr|apple gpu|immortalis|xclipse|vivante/i;

/**
 * The GPU capability profile detected through offscreen WebGL probes.
 *
 * This is the single source the rendering configuration consults instead of
 * scattered per-feature checks: backend selection reads `webgl`,
 * texture-format decisions read the {@link TextureFormatSupport} flags, and
 * `renderer`/`softwareRasterizer` let applications surface or log degraded
 * environments (e.g. SwiftShader after a driver denylist hit).
 *
 * Only WebGL2 is probed: vtk.js cannot render with WebGL1, so a WebGL1-only
 * browser reports `webgl: false` and uses CPU rendering.
 */
export interface RenderingCapabilities extends TextureFormatSupport {
  /** A WebGL2 context could be created. */
  webgl: boolean;
  /** MAX_TEXTURE_SIZE of the probed context, 0 when no context exists. */
  maxTextureSize: number;
  /** MAX_3D_TEXTURE_SIZE of the probed context, 0 when unknown. */
  max3DTextureSize: number;
  /** Unmasked renderer string when exposed by the browser, '' otherwise. */
  renderer: string;
  /** True when the renderer string identifies a software rasterizer. */
  softwareRasterizer: boolean;
}

/** A value that worked, and how often it worked. */
export type RenderingCapabilitySuccess = { value: number; successes: number };

/** The smallest value that failed, and how often a failure occurred. */
export type RenderingCapabilityFailure = { value: number; failures: number };

/**
 * A stored value: the texture edge, the texture bytes of the page when a
 * context was lost, or the texture bytes of the page when the tab stopped.
 */
export type RenderingCapabilityCategory = 'edge' | 'textureBytes' | 'gpuBytes';

/**
 * The record of one renderer, in the store of the rendering capabilities.
 *
 * `textureBytes` and `gpuBytes` both count the texture bytes of the page,
 * because a page cannot read the GPU memory of the browser. They differ in the
 * failure: `lost` is a WebGL context loss, and `crash` is a tab or GPU process
 * that stopped.
 */
export interface StoredRenderingCapabilities {
  probeVersion: number;
  renderer: string;
  /** The data types, or `undefined` until the probe runs. */
  formats?: TextureFormatSupport;
  max3DTextureSize?: number;
  /** The time of the last full probe, in milliseconds. */
  probeMs?: number;
  edge: {
    reliable?: RenderingCapabilitySuccess;
    failed?: RenderingCapabilityFailure;
  };
  textureBytes: {
    reliable?: RenderingCapabilitySuccess;
    lost?: RenderingCapabilityFailure;
  };
  gpuBytes: {
    reliable?: RenderingCapabilitySuccess;
    crash?: RenderingCapabilityFailure;
  };
}

/** The class of a renderer, which sets the conservative start of `auto`. */
export type RendererClass = 'none' | 'software' | 'mobile' | 'desktop';

interface WebGLContextInfo {
  webgl: boolean;
  maxTextureSize: number;
  renderer: string;
}

const FAILURE_KEYS = {
  edge: 'failed',
  textureBytes: 'lost',
  gpuBytes: 'crash',
} as const;

const NO_GPU_FORMATS: TextureFormatSupport = {
  norm16: false,
  norm16Linear: false,
  float: false,
  floatLinear: false,
  halfFloat: false,
  halfFloatLinear: false,
};

let cachedCapabilities: RenderingCapabilities | null = null;
/**
 * The record of the renderer of this page. It exists whenever WebGL2 exists,
 * also when the probe could not run, and it is stored once it holds a value.
 */
let record: StoredRenderingCapabilities | null = null;
/** True after this page ran the edge search for a record with no edge. */
let edgeSearchTried = false;
/** The edges whose probe could not run in this page. */
const unprobeableEdges = new Set<number>();
/** The time of the last probe context, from `performance.now()`. */
let lastProbeAt = Number.NEGATIVE_INFINITY;

let tabId: string | undefined;

/** Created on first use, so an import needs no `crypto`. */
function getTabId(): string {
  tabId ??= uuidv4();

  return tabId;
}

function getWebGLContextInfo(): WebGLContextInfo {
  const info: WebGLContextInfo = {
    webgl: false,
    maxTextureSize: 0,
    renderer: '',
  };

  if (typeof document === 'undefined') {
    return info;
  }

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');

    if (!gl) {
      return info;
    }

    info.webgl = true;
    info.maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;

    // Modern browsers expose the unmasked renderer through RENDERER directly;
    // older ones require the WEBGL_debug_renderer_info extension.
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);

    info.renderer = typeof renderer === 'string' ? renderer : '';

    const loseContext = gl.getExtension('WEBGL_lose_context');
    if (loseContext) {
      loseContext.loseContext();
    }
  } catch {
    // A throwing context factory is equivalent to "no GPU".
  }

  return info;
}

function emptyRecord(renderer: string): StoredRenderingCapabilities {
  return {
    probeVersion: RENDERING_CAPABILITIES_PROBE_VERSION,
    renderer,
    edge: {},
    textureBytes: {},
    gpuBytes: {},
  };
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads the record of one renderer. A record of another renderer or of
 * another probe version is no record.
 */
function readRecord(renderer: string): StoredRenderingCapabilities | null {
  try {
    const raw = getCapabilityStorage().getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredRenderingCapabilities;

    if (
      parsed?.probeVersion !== RENDERING_CAPABILITIES_PROBE_VERSION ||
      parsed?.renderer !== renderer
    ) {
      return null;
    }

    const stored = { ...emptyRecord(renderer), ...parsed };

    for (const category of Object.keys(FAILURE_KEYS)) {
      if (!isObject(stored[category])) {
        stored[category] = {};
      }
    }

    if (isObject(stored.formats)) {
      stored.formats = { ...NO_GPU_FORMATS, ...stored.formats };
    } else {
      delete stored.formats;
    }

    return stored;
  } catch {
    return null;
  }
}

function holdsData(target: StoredRenderingCapabilities): boolean {
  return Boolean(
    target.formats ||
      Object.keys(FAILURE_KEYS).some(
        (category) => Object.keys(target[category]).length > 0
      )
  );
}

/**
 * Applies one change to the record. The change applies to a fresh read of the
 * store, so a change that another tab stored in the meantime stays.
 */
function updateRecord(
  change: (target: StoredRenderingCapabilities) => void
): void {
  if (!record) {
    return;
  }

  const target = readRecord(record.renderer) ?? record;

  change(target);
  record = target;

  if (holdsData(target)) {
    getCapabilityStorage().setItem(STORAGE_KEY, JSON.stringify(target));
  } else {
    getCapabilityStorage().removeItem(STORAGE_KEY);
  }
}

/**
 * Adds one success to the record.
 *
 * A value above the reliable value replaces it, with one success. A value at
 * or below it adds one to the count, so `successes` counts the successes since
 * the reliable value last rose. A success at or above a failed value removes
 * that failure, because the failure did not repeat.
 */
function addSuccess(
  target: StoredRenderingCapabilities,
  category: RenderingCapabilityCategory,
  value: number
): void {
  const entry = target[category] as {
    reliable?: RenderingCapabilitySuccess;
  } & Record<string, RenderingCapabilityFailure>;
  const failureKey = FAILURE_KEYS[category];

  if (!entry.reliable || value > entry.reliable.value) {
    entry.reliable = { value, successes: 1 };
  } else {
    entry.reliable.successes++;
  }

  if (entry[failureKey] && value >= entry[failureKey].value) {
    delete entry[failureKey];
  }
}

/**
 * Adds one failure to the record. The failed value is the smallest value that
 * failed, and `failures` counts every failure.
 *
 * A failed edge at or below the reliable edge contradicts that edge, so the
 * reliable edge becomes `reliableFallback` (an edge that passed), or is
 * removed, which makes the next need probe again. A memory failure leaves the
 * reliable value, so a retest restores it.
 */
function addFailure(
  target: StoredRenderingCapabilities,
  category: RenderingCapabilityCategory,
  value: number,
  reliableFallback?: number
): void {
  const entry = target[category] as {
    reliable?: RenderingCapabilitySuccess;
  } & Record<string, RenderingCapabilityFailure>;
  const failureKey = FAILURE_KEYS[category];
  const failure = entry[failureKey];

  entry[failureKey] = {
    value: failure ? Math.min(failure.value, value) : value,
    failures: (failure?.failures ?? 0) + 1,
  };

  if (category === 'edge' && entry.reliable && entry.reliable.value >= value) {
    if (reliableFallback > 0 && reliableFallback < value) {
      entry.reliable = { value: reliableFallback, successes: 0 };
    } else {
      delete entry.reliable;
    }
  }
}

/**
 * Finds the pending records that a stopped tab left, and records each one as a
 * crash at its size. See {@link beginPendingAllocation}.
 */
function recoverPendingAllocations(target: StoredRenderingCapabilities): void {
  const storage = getCapabilityStorage();
  const now = Date.now();

  for (const key of storage.keys(PENDING_KEY_PREFIX)) {
    if (key === PENDING_KEY_PREFIX + tabId) {
      continue;
    }

    try {
      const pending = JSON.parse(storage.getItem(key) ?? 'null');

      if (now - (pending?.at ?? 0) < PENDING_STALE_MS) {
        continue;
      }

      if (
        pending?.renderer === target.renderer &&
        pending?.probeVersion === RENDERING_CAPABILITIES_PROBE_VERSION &&
        pending.totalBytes > 0
      ) {
        addFailure(target, 'gpuBytes', pending.totalBytes);
        log.warn(
          `a previous page stopped during a texture allocation of ${pending.totalBytes} bytes, so it is recorded as a crash`
        );
      }
    } catch {
      // A record that does not parse is removed below.
    }

    storage.removeItem(key);
  }
}

function noteProbe(): void {
  lastProbeAt = performance.now();
}

/**
 * Runs the capability detection: one cheap context to gather renderer string,
 * WebGL2 availability and MAX_TEXTURE_SIZE, then the combined probe of the
 * texel data types and the texture edge.
 *
 * Probe results are stored keyed by renderer string and probe version, so
 * repeat page loads on the same GPU skip the probe contexts entirely. Pass
 * `useCache: false` to force a fresh probe run (also refreshes the stored
 * record; the memory records stay).
 *
 * The probe time is measured with `performance.now()` and logged at the debug
 * level.
 */
export function detectRenderingCapabilities({
  useCache = true,
}: { useCache?: boolean } = {}): RenderingCapabilities {
  const contextInfo = getWebGLContextInfo();

  if (!contextInfo.webgl) {
    record = null;

    return {
      ...contextInfo,
      ...NO_GPU_FORMATS,
      max3DTextureSize: 0,
      softwareRasterizer: false,
    };
  }

  record =
    readRecord(contextInfo.renderer) ?? emptyRecord(contextInfo.renderer);
  let formats = useCache ? record.formats : undefined;

  if (!formats) {
    const start = performance.now();
    const probed = probeRenderingLimits({ startEdge: SAFE_PROBE_EDGE });
    const probeMs = performance.now() - start;

    noteProbe();
    log.debug(
      `the probe of the rendering capabilities took ${probeMs.toFixed(1)} ms`
    );

    // A null result means that the probe could not run. Nothing is stored,
    // and `auto` probes again when it needs an edge.
    if (probed) {
      updateRecord((target) => {
        target.formats = probed.formats;
        target.max3DTextureSize = probed.max3DTextureSize;
        target.probeMs = Math.round(probeMs * 10) / 10;

        if (probed.reliableEdge) {
          addSuccess(target, 'edge', probed.reliableEdge);
        }

        if (probed.failedEdge) {
          addFailure(target, 'edge', probed.failedEdge, probed.reliableEdge);
        }
      });
    }

    formats = probed?.formats ?? { ...NO_GPU_FORMATS };
  }

  updateRecord(recoverPendingAllocations);

  return {
    ...contextInfo,
    ...formats,
    max3DTextureSize: record.max3DTextureSize ?? 0,
    softwareRasterizer: SOFTWARE_RASTERIZER_PATTERN.test(contextInfo.renderer),
  };
}

/**
 * Returns the memoized capability profile, detecting it on first access.
 * This is the accessor the rest of the library (backend resolution, texture
 * format selection) reads.
 */
export function getRenderingCapabilities(): RenderingCapabilities {
  if (!cachedCapabilities) {
    cachedCapabilities = detectRenderingCapabilities();
  }

  return cachedCapabilities;
}

/**
 * The class of the renderer of this page.
 *
 * `none` has no WebGL2, `software` is a software rasterizer, `mobile` is a GPU
 * of a phone or a tablet (Mali, Adreno, PowerVR, Apple GPU and others), and
 * `desktop` is any other GPU.
 */
export function getRendererClass(): RendererClass {
  const capabilities = getRenderingCapabilities();

  if (!capabilities.webgl) {
    return 'none';
  }

  if (capabilities.softwareRasterizer) {
    return 'software';
  }

  return MOBILE_RENDERER_PATTERN.test(capabilities.renderer)
    ? 'mobile'
    : 'desktop';
}

/**
 * The stored record of the renderer of this page, with the success and failure
 * counts of each value. An application reads it to show the limits, or to
 * decide to offer a retest.
 *
 * @returns a copy of the record, or `null` when the page has no WebGL2
 */
export function getStoredRenderingCapabilities(): StoredRenderingCapabilities | null {
  const current = peekStoredRenderingCapabilities();

  return current ? JSON.parse(JSON.stringify(current)) : null;
}

/**
 * The record itself, with no copy, for the readers of this package. A caller
 * must not change it.
 */
export function peekStoredRenderingCapabilities(): Readonly<StoredRenderingCapabilities> | null {
  getRenderingCapabilities();

  return record;
}

/**
 * The largest edge that a probe passed and that no later failure
 * contradicts, or `undefined` when there is none.
 */
export function getReliableEdge(): number | undefined {
  const { reliable, failed } = record?.edge ?? {};

  if (!reliable || (failed && reliable.value >= failed.value)) {
    return undefined;
  }

  return reliable.value;
}

/**
 * Makes sure that the record holds an edge that a probe passed.
 *
 * When it holds none (the first probe could not run, or a failure removed
 * it), this runs the edge search once in this page, from the safe edge down.
 *
 * @returns the reliable edge, or `undefined` when no probe could run
 */
export function ensureReliableEdge(): number | undefined {
  getRenderingCapabilities();

  if (!record || getReliableEdge() || edgeSearchTried) {
    return getReliableEdge();
  }

  edgeSearchTried = true;

  const start = performance.now();
  const probed = probeEdgeSearch({ startEdge: SAFE_PROBE_EDGE });

  noteProbe();
  log.debug(
    `the edge search took ${(performance.now() - start).toFixed(1)} ms and found ${probed?.reliableEdge}`
  );

  if (probed) {
    updateRecord((target) => {
      target.max3DTextureSize = probed.max3DTextureSize;

      if (probed.reliableEdge) {
        addSuccess(target, 'edge', probed.reliableEdge);
      }

      if (probed.failedEdge) {
        addFailure(target, 'edge', probed.failedEdge, probed.reliableEdge);
      }
    });
  }

  return getReliableEdge();
}

/**
 * Adds a success to one value of the stored record. The allocation tracker
 * calls this; an application does not need to.
 */
export function recordRenderingCapabilitySuccess(
  category: RenderingCapabilityCategory,
  value: number
): void {
  getRenderingCapabilities();

  if (value > 0) {
    updateRecord((target) => addSuccess(target, category, value));
  }
}

/**
 * Adds a failure to one value of the stored record. See `addFailure` for what
 * a failure at or below the reliable value does.
 */
export function recordRenderingCapabilityFailure(
  category: RenderingCapabilityCategory,
  value: number
): void {
  getRenderingCapabilities();

  if (value > 0) {
    updateRecord((target) => addFailure(target, category, value));
  }
}

/** The time of the last probe context of this page, from `performance.now()`. */
export function getLastProbeTime(): number {
  return lastProbeAt;
}

/**
 * Tests an edge that a volume needs, before the allocation of the real
 * texture, and stores the result.
 *
 * The probe runs only when the edge is above the reliable edge, below the
 * failed edge and not above MAX_3D_TEXTURE_SIZE. It runs synchronously in a
 * new probe context, and its time is logged at the debug level. An edge whose
 * probe could not run is not tried again in this page.
 *
 * @returns true when the probe ran
 */
export function probeRenderingEdge(
  edge: number,
  format: ProbeTextureFormat = 'float'
): boolean {
  getRenderingCapabilities();

  if (
    !record ||
    unprobeableEdges.has(edge) ||
    edge <= (getReliableEdge() ?? 0) ||
    (record.edge.failed && edge >= record.edge.failed.value) ||
    edge > (record.max3DTextureSize ?? 0)
  ) {
    return false;
  }

  const start = performance.now();
  const passed = probeTextureEdge(edge, format);

  noteProbe();
  log.debug(
    `the probe of the edge ${edge} (${format}) took ${(performance.now() - start).toFixed(1)} ms and ${passed ? 'passed' : 'failed'}`
  );

  if (passed === undefined) {
    unprobeableEdges.add(edge);

    return false;
  }

  updateRecord((target) =>
    passed ? addSuccess(target, 'edge', edge) : addFailure(target, 'edge', edge)
  );

  return true;
}

/**
 * Writes the pending record of this tab before a large allocation. A pending
 * record that a later start finds means that the page stopped during that
 * allocation, which is a crash.
 */
export function beginPendingAllocation(totalBytes: number): void {
  getRenderingCapabilities();

  if (!record) {
    return;
  }

  getCapabilityStorage().setItem(
    PENDING_KEY_PREFIX + getTabId(),
    JSON.stringify({
      renderer: record.renderer,
      probeVersion: RENDERING_CAPABILITIES_PROBE_VERSION,
      totalBytes,
      at: Date.now(),
    })
  );
}

/** Removes the pending record of this tab. */
export function clearPendingAllocation(): void {
  if (tabId) {
    getCapabilityStorage().removeItem(PENDING_KEY_PREFIX + tabId);
  }
}

/** What {@link retestRenderingCapabilities} clears. All by default. */
export type RetestRenderingCapabilitiesOptions = {
  edge?: boolean;
  textureBytes?: boolean;
  gpuBytes?: boolean;
  formats?: boolean;
};

/**
 * Clears the failures of the selected categories. A retest is the one way to
 * try a failed value again, and the application decides when to offer it.
 *
 * - `edge`: the reliable edge stays, and the next need above it runs the probe
 *   again. A record with no reliable edge runs the edge search again.
 * - `textureBytes`, `gpuBytes`: the memory limit returns to the larger of the
 *   start value and the reliable value. A crash during the next try is
 *   recorded again by the same pending record.
 * - `formats`: the next detection probes the data types again. Decisions that
 *   `init()` already took from the formats (for example `useCPURendering` or
 *   the use of norm16) do not change until the next load.
 *
 * Cornerstone3D shows no prompt.
 *
 * @param options - the categories to clear; none stated clears all
 */
export function retestRenderingCapabilities(
  options: RetestRenderingCapabilitiesOptions = {}
): void {
  getRenderingCapabilities();

  const all = !Object.values(options).some(Boolean);

  updateRecord((target) => {
    for (const category of Object.keys(
      FAILURE_KEYS
    ) as RenderingCapabilityCategory[]) {
      if (all || options[category]) {
        delete (target[category] as Record<string, unknown>)[
          FAILURE_KEYS[category]
        ];
      }
    }

    if (all || options.formats) {
      delete target.formats;
    }
  });

  if (all || options.edge) {
    edgeSearchTried = false;
    unprobeableEdges.clear();
  }

  if (all || options.formats) {
    cachedCapabilities = null;
  }
}

/**
 * Drops the in-memory profile (and optionally the stored record) so the
 * next {@link getRenderingCapabilities} call re-detects. `clearStorage`
 * removes the whole record and every pending record, so the next load probes
 * from the start.
 */
export function resetRenderingCapabilities({
  clearStorage = false,
}: { clearStorage?: boolean } = {}): void {
  cachedCapabilities = null;
  record = null;
  edgeSearchTried = false;
  unprobeableEdges.clear();

  if (clearStorage) {
    const storage = getCapabilityStorage();

    storage.removeItem(STORAGE_KEY);

    for (const key of storage.keys(PENDING_KEY_PREFIX)) {
      storage.removeItem(key);
    }
  }
}
