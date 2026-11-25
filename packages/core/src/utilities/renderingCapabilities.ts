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
import fnv1aHash from './fnv1aHash';

const log = coreLog.getLogger('utilities', 'renderingCapabilities');

/**
 * Bump when the probes (or the meaning of any profile field) change so that
 * profiles cached by earlier versions are discarded.
 *
 * Version 2 probes 3D textures, and adds the edge and the memory records.
 * Version 3 kept a normal level and a ceiling for each memory record.
 * Version 4 records memory with no automatic policy, adds the GPU memory
 * limit that the user chose, and probes unsigned 16-bit textures.
 */
export const RENDERING_CAPABILITIES_PROBE_VERSION = 4;

const STORAGE_KEY = 'cornerstone3D.renderingCapabilities';
const PENDING_KEY_PREFIX = `${STORAGE_KEY}.pending.`;

/**
 * The renderer of the last page that had WebGL2. A page that starts with no
 * WebGL2, for example while the browser blocks it, writes the memory limit of
 * the user to the record of this renderer.
 */
const LAST_RENDERER_KEY = `${STORAGE_KEY}.lastRenderer`;

/** The key of the record of one renderer, so each GPU keeps its own record. */
function recordKey(renderer: string): string {
  return `${STORAGE_KEY}.${fnv1aHash(renderer)}`;
}

/** The edge that the first probe tests. */
const SAFE_PROBE_EDGE = 2048;

/** The smallest GPU memory limit that the user or the configuration can state. */
export const GPU_MEMORY_MIN_BYTES = 128 * 1024 * 1024;

/**
 * A pending record of another renderer stays this long, for a page of that
 * renderer to find it, for example after a laptop switches its GPU.
 */
const OTHER_RENDERER_PENDING_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A pending record younger than this can belong to a tab that still runs its
 * allocation, so the startup scan leaves it for a later start. A live tab keeps
 * its record for up to 30 s with no render, and 5 s more to settle.
 */
const PENDING_STALE_MS = 60000;

const SOFTWARE_RASTERIZER_PATTERN =
  /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;

const MOBILE_RENDERER_PATTERN =
  /mali|adreno|powervr|apple gpu|immortalis|xclipse|vivante/i;

/** Safari reports this renderer on every Apple device, a Mac included. */
const APPLE_GPU_PATTERN = /apple gpu/i;

/**
 * True on a Mac with no touch screen. An iPad in desktop mode also reports a
 * Mac platform, but it has touch points.
 */
function isMacDesktop(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /mac/i.test(navigator.platform ?? '') &&
    !(navigator.maxTouchPoints > 0)
  );
}

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
 * The record of one memory category. The values are GPU bytes of the page.
 *
 * - `largest`: the largest total that worked, and how often it worked.
 * - `failed`: the smallest total that failed, and how often a failure
 *   occurred.
 *
 * The record only records. Nothing raises or lowers the memory limit from it;
 * the user or the application sets the limit (see `setGpuMemoryLimit`).
 */
export type RenderingCapabilityMemory = {
  largest?: RenderingCapabilitySuccess;
  failed?: RenderingCapabilityFailure;
};

/**
 * The GPU memory limit that the user chose, in GPU bytes of the page. A `hard`
 * limit is used as it is; a plain one is the user's choice until another
 * choice or a reset.
 */
export type GpuMemoryUserLimit = { bytes: number; hard: boolean };

/**
 * A stored value: the texture edge, the texture bytes of the page when a
 * context was lost, or the texture bytes of the page when the tab stopped.
 */
export type RenderingCapabilityCategory = 'edge' | 'textureBytes' | 'gpuBytes';

/**
 * The record of one renderer, in the store of the rendering capabilities.
 *
 * `textureBytes` and `gpuBytes` both count the GPU bytes of the page (see
 * `gpuMemoryLedger`), because a page cannot read the GPU memory of the browser.
 * They differ in the failure: `textureBytes` records a WebGL context loss, and
 * `gpuBytes` records a tab or GPU process that stopped.
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
  textureBytes: RenderingCapabilityMemory;
  gpuBytes: RenderingCapabilityMemory;
  /** The memory limit that the user chose, or `undefined` for none. */
  memoryLimit?: GpuMemoryUserLimit;
}

/** The class of a renderer, which sets the conservative start of `auto`. */
export type RendererClass = 'none' | 'software' | 'mobile' | 'desktop';

interface WebGLContextInfo {
  webgl: boolean;
  maxTextureSize: number;
  renderer: string;
}

const CATEGORIES: RenderingCapabilityCategory[] = [
  'edge',
  'textureBytes',
  'gpuBytes',
];

const NO_GPU_FORMATS: TextureFormatSupport = {
  norm16: false,
  norm16Linear: false,
  unorm16: false,
  unorm16Linear: false,
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

    /**
     * Modern browsers expose the unmasked renderer through RENDERER directly;
     * older ones require the WEBGL_debug_renderer_info extension.
     */
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
    /** A throwing context factory is equivalent to "no GPU". */
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

/** The number, or `undefined` when it is not a finite number. */
function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * The object with each named field as a finite number, or `undefined` when one
 * of them is not.
 */
function numbers<T>(value: unknown, fields: (keyof T)[]): T | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const result = {} as T;

  for (const field of fields) {
    const number = finite(value[field as string]);

    if (number === undefined) {
      return undefined;
    }

    result[field] = number as T[keyof T];
  }

  return result;
}

/** Puts `value` at `key`, or removes the key when the value is missing. */
function setOrDelete<T extends object>(
  target: T,
  key: keyof T,
  value: unknown
): void {
  if (value === undefined) {
    delete target[key];
  } else {
    target[key] = value as T[keyof T];
  }
}

/** A memory record with every invalid value removed. */
function validMemory(value: unknown): RenderingCapabilityMemory {
  const memory: RenderingCapabilityMemory = {};

  if (!isObject(value)) {
    return memory;
  }

  const entry = value as RenderingCapabilityMemory;

  setOrDelete(
    memory,
    'largest',
    numbers<RenderingCapabilitySuccess>(entry.largest, ['value', 'successes'])
  );
  setOrDelete(
    memory,
    'failed',
    numbers<RenderingCapabilityFailure>(entry.failed, ['value', 'failures'])
  );

  return memory;
}

/**
 * The memory limit of the user, or `undefined` when it is not valid or below
 * `GPU_MEMORY_MIN_BYTES`.
 */
function validMemoryLimit(value: unknown): GpuMemoryUserLimit | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const bytes = finite((value as GpuMemoryUserLimit).bytes);

  return bytes >= GPU_MEMORY_MIN_BYTES
    ? { bytes, hard: (value as GpuMemoryUserLimit).hard === true }
    : undefined;
}

/**
 * Reads the record of one renderer. A record of another renderer or of
 * another probe version is no record. A stored value that is not a finite
 * number, or that has the wrong shape, counts as missing.
 */
function readRecord(renderer: string): StoredRenderingCapabilities | null {
  try {
    const raw = getCapabilityStorage().getItem(recordKey(renderer));

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

    const stored = emptyRecord(renderer);
    const edge = isObject(parsed.edge) ? parsed.edge : {};

    setOrDelete(
      stored.edge,
      'reliable',
      numbers<RenderingCapabilitySuccess>(edge.reliable, ['value', 'successes'])
    );
    setOrDelete(
      stored.edge,
      'failed',
      numbers<RenderingCapabilityFailure>(edge.failed, ['value', 'failures'])
    );
    stored.textureBytes = validMemory(parsed.textureBytes);
    stored.gpuBytes = validMemory(parsed.gpuBytes);
    setOrDelete(stored, 'memoryLimit', validMemoryLimit(parsed.memoryLimit));
    setOrDelete(stored, 'max3DTextureSize', finite(parsed.max3DTextureSize));
    setOrDelete(stored, 'probeMs', finite(parsed.probeMs));

    /**
     * Formats count as probed only when every flag is a boolean, so an
     * incomplete record probes again instead of reporting no support.
     */
    if (
      isObject(parsed.formats) &&
      Object.keys(NO_GPU_FORMATS).every(
        (name) => typeof parsed.formats[name] === 'boolean'
      )
    ) {
      stored.formats = { ...NO_GPU_FORMATS };

      for (const name of Object.keys(NO_GPU_FORMATS)) {
        stored.formats[name] = parsed.formats[name] === true;
      }
    }

    return stored;
  } catch {
    return null;
  }
}

function holdsData(target: StoredRenderingCapabilities): boolean {
  return Boolean(
    target.formats ||
      target.memoryLimit ||
      CATEGORIES.some((category) => Object.keys(target[category]).length > 0)
  );
}

/** Stores the record, or removes it when it holds nothing. */
function writeRecord(target: StoredRenderingCapabilities): void {
  const key = recordKey(target.renderer);

  if (holdsData(target)) {
    getCapabilityStorage().setItem(key, JSON.stringify(target));
  } else {
    getCapabilityStorage().removeItem(key);
  }
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

  try {
    const target = readRecord(record.renderer) ?? record;

    change(target);
    record = target;
    writeRecord(target);
  } catch (error) {
    /** A render must not stop because the record cannot change. */
    log.warn('the record of the rendering capabilities did not change', error);
  }
}

/**
 * Applies one change to the record of this page, or, in a page with no
 * WebGL2, to the record of the last renderer that a page had (see
 * `LAST_RENDERER_KEY`). The second case leaves the record of this page empty,
 * so no probe runs from it.
 *
 * @returns true when the change was stored
 */
function updateRecordOfLastRenderer(
  change: (target: StoredRenderingCapabilities) => void
): boolean {
  getRenderingCapabilities();

  if (record) {
    updateRecord(change);

    return true;
  }

  try {
    const renderer = getCapabilityStorage().getItem(LAST_RENDERER_KEY);

    if (!renderer) {
      return false;
    }

    const target = readRecord(renderer) ?? emptyRecord(renderer);

    change(target);
    writeRecord(target);

    return true;
  } catch (error) {
    log.warn('the record of the last renderer did not change', error);

    return false;
  }
}

/** The record of this page, or of the last renderer in a page with no WebGL2. */
function recordOrLastRenderer(): StoredRenderingCapabilities | null {
  getRenderingCapabilities();

  if (record) {
    return record;
  }

  const renderer = getCapabilityStorage().getItem(LAST_RENDERER_KEY);

  return renderer ? readRecord(renderer) : null;
}

/**
 * Adds one success to the record.
 *
 * For the edge, a value above the reliable value replaces it, with one
 * success. A value at or below it adds one to the count, so `successes` counts
 * the successes since the reliable value last rose. A success at or above a
 * failed edge removes that failure, because the failure did not repeat.
 *
 * For memory, a total above `largest` replaces it, with one success, and a
 * total at or below it adds one to its count. A memory success removes no
 * failure: the record keeps both, and nothing changes the limit from them.
 */
function addSuccess(
  target: StoredRenderingCapabilities,
  category: RenderingCapabilityCategory,
  value: number
): void {
  if (category !== 'edge') {
    const entry = target[category];

    if (!entry.largest || value > entry.largest.value) {
      entry.largest = { value, successes: 1 };
    } else {
      entry.largest.successes++;
    }

    return;
  }

  const entry = target.edge;

  if (!entry.reliable || value > entry.reliable.value) {
    entry.reliable = { value, successes: 1 };
  } else {
    entry.reliable.successes++;
  }

  if (entry.failed && value >= entry.failed.value) {
    delete entry.failed;
  }
}

/**
 * Adds one failure to the record.
 *
 * The failed value is the smallest value that failed, and `failures` counts
 * every failure.
 *
 * For the edge, a failed edge at or below the reliable edge contradicts that
 * edge, so the reliable edge becomes `reliableFallback` (an edge that passed),
 * or is removed, which makes the next need probe again.
 */
function addFailure(
  target: StoredRenderingCapabilities,
  category: RenderingCapabilityCategory,
  value: number,
  reliableFallback?: number
): void {
  const entry = target[category];

  entry.failed = {
    value: entry.failed ? Math.min(entry.failed.value, value) : value,
    failures: (entry.failed?.failures ?? 0) + 1,
  };

  if (category !== 'edge') {
    return;
  }

  const edge = target.edge;

  if (edge.reliable && edge.reliable.value >= value) {
    if (reliableFallback > 0 && reliableFallback < value) {
      edge.reliable = { value: reliableFallback, successes: 0 };
    } else {
      delete edge.reliable;
    }
  }
}

/**
 * Finds the pending records that a stopped tab left, and records each one as a
 * crash at its size. See {@link beginPendingAllocation}.
 *
 * @param handled - receives the keys to remove once the record is stored, so
 * a page that stops before that finds them again
 */
function recoverPendingAllocations(
  target: StoredRenderingCapabilities,
  handled: string[]
): void {
  const storage = getCapabilityStorage();
  const now = Date.now();

  for (const key of storage.keys(PENDING_KEY_PREFIX)) {
    if (key === PENDING_KEY_PREFIX + tabId) {
      continue;
    }

    try {
      const pending = JSON.parse(storage.getItem(key) ?? 'null');

      const age = now - (pending?.at ?? 0);

      if (age < PENDING_STALE_MS) {
        continue;
      }

      /** A page of the other renderer records it; an old one is dropped. */
      if (
        pending?.renderer !== target.renderer &&
        age < OTHER_RENDERER_PENDING_MS
      ) {
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
      /** A record that does not parse is removed too. */
    }

    handled.push(key);
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
 * record; the memory records and the memory limit stay).
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

  const storage = getCapabilityStorage();

  /** The single record of version 1, which held the formats only. */
  storage.removeItem(STORAGE_KEY);
  storage.setItem(LAST_RENDERER_KEY, contextInfo.renderer);

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

    /**
     * A null result means that the probe could not run. Nothing is stored,
     * and `auto` probes again when it needs an edge.
     */
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

  const handled: string[] = [];

  updateRecord((target) => recoverPendingAllocations(target, handled));
  handled.forEach((key) => storage.removeItem(key));

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
 * `desktop` is any other GPU. Safari reports "Apple GPU" on a Mac too, so an
 * "Apple GPU" on a Mac with no touch screen is `desktop`.
 */
export function getRendererClass(): RendererClass {
  const capabilities = getRenderingCapabilities();

  if (!capabilities.webgl) {
    return 'none';
  }

  if (capabilities.softwareRasterizer) {
    return 'software';
  }

  const { renderer } = capabilities;

  return MOBILE_RENDERER_PATTERN.test(renderer) &&
    !(APPLE_GPU_PATTERN.test(renderer) && isMacDesktop())
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

/**
 * The memory limit that the user chose, from the record of this page, or of
 * the last renderer when this page has no WebGL2.
 *
 * @returns a copy, or `undefined` when the user chose none
 */
export function getStoredGpuMemoryLimit(): GpuMemoryUserLimit | undefined {
  const limit = recordOrLastRenderer()?.memoryLimit;

  return limit ? { ...limit } : undefined;
}

/**
 * Stores the memory limit that the user chose, or removes it with
 * `undefined`. It works while WebGL2 is unavailable, through the record of the
 * last renderer, so the limit that the user picks after a failure is the one
 * that the next load uses. `gpuSettingsPresets` validates the value.
 *
 * @returns true when the store holds the change
 */
export function storeGpuMemoryLimit(
  limit: GpuMemoryUserLimit | undefined
): boolean {
  if (
    !updateRecordOfLastRenderer((target) =>
      setOrDelete(target, 'memoryLimit', limit && { ...limit })
    )
  ) {
    return false;
  }

  /** A store that refused the write, for example a full quota, keeps the old value. */
  const stored = getStoredGpuMemoryLimitFromStore();

  return limit
    ? stored?.bytes === limit.bytes && stored?.hard === limit.hard
    : stored === undefined;
}

/** The memory limit as the store holds it now, with no cached record. */
function getStoredGpuMemoryLimitFromStore(): GpuMemoryUserLimit | undefined {
  const renderer =
    record?.renderer ?? getCapabilityStorage().getItem(LAST_RENDERER_KEY);

  return renderer ? readRecord(renderer)?.memoryLimit : undefined;
}

/**
 * Clears the memory records and the memory limit of the user. The edge and
 * the formats stay.
 *
 * @returns true when the store holds the change
 */
export function clearGpuMemoryRecords(): boolean {
  return updateRecordOfLastRenderer((target) => {
    target.textureBytes = {};
    target.gpuBytes = {};
    delete target.memoryLimit;
  });
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
 * try a failed edge again, and the application decides when to offer it.
 *
 * - `edge`: the reliable edge stays, and the next need above it runs the probe
 *   again. A record with no reliable edge runs the edge search again.
 * - `textureBytes`, `gpuBytes`: the recorded failures go. The memory limit
 *   does not change, because the record never sets it.
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
    if (all || options.edge) {
      delete target.edge.failed;
    }

    for (const category of ['textureBytes', 'gpuBytes'] as const) {
      if (all || options[category]) {
        delete target[category].failed;
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
 * removes the record of every renderer, every pending record and the memory
 * limit of the user, so the next load probes from the start.
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

    /** The record of each renderer, every pending record and the last renderer. */
    for (const key of storage.keys(STORAGE_KEY)) {
      storage.removeItem(key);
    }
  }
}
