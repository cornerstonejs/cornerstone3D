import type { VoxelGridLimits } from '../types';
import {
  getCanUseNorm16Texture,
  getConfiguration,
  getLossyDownsampling,
  getShouldUseCPURendering,
} from '../init';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import triggerEvent from './triggerEvent';
import { coreLog } from './logger';
import {
  getConfiguredMaxTextureEdge,
  getRendererClass,
  getReliableEdge,
  getStoredGpuMemoryLimit,
  clearGpuMemoryRecords,
  GPU_MEMORY_MIN_BYTES,
  isEdgeSearchPending,
  peekStoredRenderingCapabilities,
  runEdgeSearchInContext,
  storeGpuMemoryLimit,
} from './renderingCapabilities';
import type {
  GpuMemoryUserLimit,
  RendererClass,
} from './renderingCapabilities';

const log = coreLog.getLogger('utilities', 'gpuSettingsPresets');

/**
 * How fast a device of this class draws, on a relative scale.
 *
 * 1 is a slow CPU that emulates a GPU in software. 100 is a recent
 * top-of-the-line GPU at the time of writing. The scale has no upper bound, so
 * a device that is faster than anything available today takes a value above
 * 100, and no existing preset changes.
 *
 * The value is relative, and it states no number of frames for each second,
 * because a measurement of the frame rate does not belong to a preset.
 */
export type GpuSpeedIndex = number;

/**
 * The GPU settings that the volume render reads: the limits that a texture must
 * respect, and the speed class of the device. They apply only when final
 * downsampling is on (see `rendering.lossyDownsampling.final` of the
 * configuration).
 *
 * A preset is a named set of these values. `auto` is the default preset: its
 * edge comes from the probe of the device, and its memory from the limit
 * choice (see `getGpuMemoryLimit`). A named preset, which an application
 * selects, is a fixed limit for each texture and overrides `auto`.
 *
 * The GPU settings are limits of GPU rendering through WebGL. A software
 * renderer and CPU rendering ignore them (see `gpuSettingsApply`).
 */
export type GpuSettings = {
  /** The name of the preset that gave these values. */
  id: GpuSettingsPresetId;
  /**
   * The largest number of voxels that one axis of one texture can hold.
   * WebGL devices commonly report 2048; a preset may state a lower edge so
   * that a weak GPU reduces before it loses the context.
   */
  maxTextureEdge: number;
  /**
   * The number of bytes of texture memory. A named preset limits each
   * texture. `auto` limits the GPU memory of the page, and
   * `gpuSettingsForShare` gives one texture its fair share of the page.
   */
  textureMemoryBytes: number;
  /** How fast this class of device draws. See `GpuSpeedIndex`. */
  speed: GpuSpeedIndex;
  /**
   * True for a preset that exists for a test, which an application must not
   * select in production.
   */
  internal?: boolean;
};

export type GpuSettingsPresetId =
  | 'auto'
  | 'low-tablet'
  | 'low'
  | 'medium'
  | 'high'
  | 'high-texture-4096';

type NamedPresetId = Exclude<GpuSettingsPresetId, 'auto'>;

const MEGABYTE = 1024 * 1024;
const GIGABYTE = 1024 * MEGABYTE;

/**
 * The presets.
 *
 * `medium` and `high` share the WebGL edge of 2048 and differ by memory.
 * `low` and `low-tablet` use an edge of 256, so that a weak integrated GPU
 * reduces a large volume before a WebGL context loss; `low` states more memory
 * than `low-tablet`.
 *
 * `high-texture-4096` is the control of the example, and it fits no real
 * device. One volume renders with no reduction under `high-texture-4096` and
 * with a reduction under `high`, which shows that the reduction comes from the
 * limit and not from a defect.
 */
const PRESETS: Record<NamedPresetId, GpuSettings> = {
  'low-tablet': {
    id: 'low-tablet',
    maxTextureEdge: 256,
    textureMemoryBytes: 1 * GIGABYTE,
    speed: 10,
  },
  low: {
    id: 'low',
    maxTextureEdge: 256,
    textureMemoryBytes: 2 * GIGABYTE,
    speed: 30,
  },
  medium: {
    id: 'medium',
    maxTextureEdge: 2048,
    textureMemoryBytes: 8 * GIGABYTE,
    speed: 60,
  },
  high: {
    id: 'high',
    maxTextureEdge: 2048,
    textureMemoryBytes: 32 * GIGABYTE,
    speed: 100,
  },
  'high-texture-4096': {
    id: 'high-texture-4096',
    maxTextureEdge: 4096,
    textureMemoryBytes: 32 * GIGABYTE,
    /** The control shares the speed of `high`; only its edge differs. */
    speed: 100,
    internal: true,
  },
};

/**
 * The preset that applies when an application selects none.
 *
 * `auto` reads the stored record of the device, which the probe and the
 * allocation tracker fill. The reported `MAX_3D_TEXTURE_SIZE` is not a
 * reliable limit, because some Android devices report 2048 or more but render
 * only 128 or 256 per axis; the probe tests the edge instead.
 */
const DEFAULT_PRESET_ID: GpuSettingsPresetId = 'auto';

let activePresetId: GpuSettingsPresetId = DEFAULT_PRESET_ID;

type GpuRendererClass = Exclude<RendererClass, 'none' | 'software'>;

/** The named preset whose speed `auto` reports for a class of GPU. */
const SPEED_PRESET_OF_CLASS: Record<GpuRendererClass, NamedPresetId> = {
  mobile: 'low-tablet',
  desktop: 'medium',
};

/**
 * The memory that `auto` starts from for a class of GPU, before the user or
 * the application states one: the memory of `low-tablet` for a phone or a
 * tablet, and 2 GB for any other GPU. 2 GB holds a 512 x 512 x 4096 volume of
 * 16 bits. Nothing raises or lowers it by itself, so a weak GPU that fails at
 * this start gets a smaller size from the user.
 */
const START_MEMORY_OF_CLASS: Record<GpuRendererClass, number> = {
  mobile: PRESETS['low-tablet'].textureMemoryBytes,
  desktop: 2 * GIGABYTE,
};

/**
 * A device with a probed edge below `SMALL_EDGE` almost always has little GPU
 * memory too, so `auto` starts it from `SMALL_EDGE_START_MEMORY_BYTES` when
 * that is smaller than the memory of its class.
 */
const SMALL_EDGE = 2048;
const SMALL_EDGE_START_MEMORY_BYTES = 512 * MEGABYTE;

/**
 * The smallest texture memory that `auto` gives to a new texture, so that a
 * small limit still renders a small volume after the canvases and contexts.
 */
const MIN_TEXTURE_BYTES = 32 * MEGABYTE;

/**
 * The edge of `auto` when no probe has passed any edge, because no probe could
 * run. The smallest edge known to fail on a real device is above 128. When the
 * record states a failure at or below 128, the edge is 8, which the format
 * probe passed.
 */
const UNPROBED_EDGE_FLOOR = 128;
const FORMAT_PROBE_EDGE = 8;

/** Where the memory limit of `auto` comes from. See `getGpuMemoryLimit`. */
export type GpuMemoryLimitSource =
  | 'hardConfig'
  | 'hardUser'
  | 'user'
  | 'config'
  | 'start';

/** The memory limit of `auto`, in GPU bytes of the page, and its source. */
export type GpuMemoryLimit = {
  bytes: number;
  source: GpuMemoryLimitSource;
  /** True when the limit is a hard limit, from the configuration or the user. */
  hard: boolean;
};

/**
 * True when the GPU settings apply, whatever preset is active. They describe
 * the texture limits and the memory of a WebGL GPU, not CPU memory, so they
 * apply to GPU rendering only. A software renderer (class `software`) and CPU
 * rendering (class `none`, or `useCPURendering`) ignore them, and render as
 * with final downsampling off.
 */
function gpuSettingsApply(): boolean {
  if (getShouldUseCPURendering()) {
    return false;
  }

  const rendererClass = getRendererClass();

  return rendererClass === 'mobile' || rendererClass === 'desktop';
}

/** `rendering.autoGpuSettings` of the configuration. */
function autoGpuConfig() {
  return getConfiguration()?.rendering?.autoGpuSettings;
}

/** A configured size, or `undefined` when it is missing or too small. */
function configuredBytes(value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= GPU_MEMORY_MIN_BYTES
  ) {
    return value;
  }

  log.warn(
    `gpuSettingsPresets: rendering.autoGpuSettings.${name} must be at least ${GPU_MEMORY_MIN_BYTES} bytes, so it is ignored`
  );

  return undefined;
}

/**
 * The memory that `auto` starts from on this device, in GPU bytes of the
 * page: the memory of its class (see `START_MEMORY_OF_CLASS`), or 0.5 GB when
 * the probed edge is below 2048. The smallest wins.
 *
 * @returns the start, or `undefined` when the GPU settings do not apply
 */
function startMemoryBytes(): number | undefined {
  if (!gpuSettingsApply()) {
    return undefined;
  }

  const classMemory =
    START_MEMORY_OF_CLASS[getRendererClass() as GpuRendererClass];
  const edge = getReliableEdge();

  return edge !== undefined && edge < SMALL_EDGE
    ? Math.min(classMemory, SMALL_EDGE_START_MEMORY_BYTES)
    : classMemory;
}

/**
 * The user's latest choice, held by this page when the store refused it: a
 * limit, or `limit: undefined` after a reset. It wins over the store until
 * the next set or reset that the store keeps.
 */
let pageChoice: { limit?: GpuMemoryUserLimit } | undefined;

/**
 * The memory limit of `auto`, in GPU bytes of the page, in this order:
 *
 * 1. a hard limit, used as it is: `hardMemoryBytes` of
 *    `rendering.autoGpuSettings`, or a value the user set with `hard: true`.
 *    When both exist, the configuration wins.
 * 2. else, the value the user set (see `setGpuMemoryLimit`)
 * 3. else, `startMemoryBytes` of `rendering.autoGpuSettings`, the initial
 *    size that an application states
 * 4. else, the start of the device (see `startMemoryBytes`)
 *
 * Nothing raises or lowers the limit by itself. A failure is recorded, and the
 * user or the application picks a new limit.
 *
 * @returns the limit, or `undefined` when the GPU settings do not apply
 */
function getGpuMemoryLimit(): GpuMemoryLimit | undefined {
  if (!gpuSettingsApply()) {
    return undefined;
  }

  const config = autoGpuConfig();
  const hardConfig = configuredBytes(
    config?.hardMemoryBytes,
    'hardMemoryBytes'
  );

  if (hardConfig !== undefined) {
    return { bytes: hardConfig, source: 'hardConfig', hard: true };
  }

  /** A choice of this page that the store could not keep wins over the store. */
  const user = pageChoice ? pageChoice.limit : getStoredGpuMemoryLimit();

  if (user) {
    return user.hard
      ? { bytes: user.bytes, source: 'hardUser', hard: true }
      : { bytes: user.bytes, source: 'user', hard: false };
  }

  const configStart = configuredBytes(
    config?.startMemoryBytes,
    'startMemoryBytes'
  );

  if (configStart !== undefined) {
    return { bytes: configStart, source: 'config', hard: false };
  }

  return { bytes: startMemoryBytes(), source: 'start', hard: false };
}

/**
 * Sets the GPU memory limit of `auto`, the user's choice, for example from a
 * dialog after a failure. The choice stays, also after a reload, until another
 * choice or `resetGpuMemoryLimit`. A hard limit from the configuration still
 * wins (see `getGpuMemoryLimit`).
 *
 * The change applies at once: `GPU_MEMORY_LIMIT_CHANGED` fires with the
 * previous and the current limit, then `VOLUME_TEXTURE_LIMITS_CHANGED`, so a
 * lower limit provisions the textures on screen smaller, and a higher one
 * provisions them larger. It works while the WebGL context is lost or WebGL
 * is unavailable, because it only writes the record.
 *
 * @param options.bytes - the limit, in GPU bytes of the page, at least 128 MB
 * @param options.hard - true to use exactly this limit
 */
function setGpuMemoryLimit({
  bytes,
  hard = false,
}: {
  bytes: number;
  hard?: boolean;
}): void {
  if (
    typeof bytes !== 'number' ||
    !Number.isFinite(bytes) ||
    bytes < GPU_MEMORY_MIN_BYTES
  ) {
    throw new Error(
      `setGpuMemoryLimit: the limit must be at least ${GPU_MEMORY_MIN_BYTES} bytes, not ${bytes}`
    );
  }

  const limit = { bytes: Math.floor(bytes), hard: Boolean(hard) };
  const previous = getGpuMemoryLimit();

  pageChoice = storeGpuMemoryLimit(limit) ? undefined : { limit };
  announceLimitChange(previous);
}

/**
 * Clears the memory limit of the user and the memory records of the device.
 * The limit returns to the configuration or the start of the device. The
 * probed edge and the texel formats stay. The change applies at once, as in
 * `setGpuMemoryLimit`.
 */
function resetGpuMemoryLimit(): void {
  const previous = getGpuMemoryLimit();

  pageChoice = clearGpuMemoryRecords() ? undefined : { limit: undefined };
  announceLimitChange(previous);
}

/**
 * Fires `GPU_MEMORY_LIMIT_CHANGED` with the limit before and after a set or a
 * reset, then `VOLUME_TEXTURE_LIMITS_CHANGED`, so the strategies provision
 * again under the new limit.
 */
function announceLimitChange(previous: GpuMemoryLimit | undefined): void {
  triggerEvent(eventTarget, Events.GPU_MEMORY_LIMIT_CHANGED, {
    previous,
    current: getGpuMemoryLimit(),
  });
  triggerEvent(eventTarget, Events.VOLUME_TEXTURE_LIMITS_CHANGED);
}

/**
 * The edge of `auto`: the reliable edge of the record, which the startup
 * probe tested up to 2048 and assumed above it (see `renderingCapabilities`).
 * When no probe has run, the edge is `UNPROBED_EDGE_FLOOR` until the edge
 * search runs in the context of a viewport (see `runPendingEdgeSearch`).
 * `maxTextureEdge` of `rendering.autoGpuSettings` caps the edge.
 */
function autoEdge(): number {
  const reliable = getReliableEdge();
  const failed = peekStoredRenderingCapabilities()?.edge.failed?.value;

  return Math.min(
    reliable ??
      (failed && failed <= UNPROBED_EDGE_FLOOR
        ? FORMAT_PROBE_EDGE
        : UNPROBED_EDGE_FLOOR),
    getConfiguredMaxTextureEdge()
  );
}

/**
 * The `auto` preset. The edge is the reliable edge of the probe (see
 * `autoEdge`), the memory is the limit of `getGpuMemoryLimit`, and the speed
 * is the one of a named preset for the class of the GPU.
 *
 * When the GPU settings do not apply (see `gpuSettingsApply`), `auto` has no
 * limit and reads no record. `auto` runs no probe itself.
 */
function getAutoGpuSettings(): GpuSettings {
  const memory = getGpuMemoryLimit();

  if (!memory) {
    return {
      id: 'auto',
      maxTextureEdge: Number.POSITIVE_INFINITY,
      textureMemoryBytes: Number.POSITIVE_INFINITY,
      speed: 1,
    };
  }

  return {
    id: 'auto',
    maxTextureEdge: autoEdge(),
    textureMemoryBytes: memory.bytes,
    speed:
      PRESETS[SPEED_PRESET_OF_CLASS[getRendererClass() as GpuRendererClass]]
        .speed,
  };
}

/**
 * Every preset: `auto` first, then the named presets, the internal one
 * included. The values of `auto` come from the stored record, so the first
 * call can run the startup probe, also with final downsampling off.
 */
function getGpuSettingsPresets(): GpuSettings[] {
  return [getAutoGpuSettings(), ...Object.values(PRESETS)];
}

/**
 * The preset of one name. `auto` reads the stored record each time. A named
 * preset comes back with its values on every renderer, but the render path
 * ignores it on a software renderer and on CPU rendering (see
 * `gpuSettingsForRender`).
 */
function getGpuSettingsPreset(id: GpuSettingsPresetId): GpuSettings {
  if (id === 'auto') {
    return getAutoGpuSettings();
  }

  const preset = Object.prototype.hasOwnProperty.call(PRESETS, id)
    ? PRESETS[id]
    : undefined;

  if (!preset) {
    throw new Error(`gpuSettingsPresets: there is no preset named ${id}`);
  }

  return preset;
}

/**
 * Selects the preset that applies. A named preset overrides `auto`, and
 * `resetGpuSettingsPreset` returns to `auto`.
 */
function setGpuSettingsPreset(id: GpuSettingsPresetId): void {
  if (id !== 'auto') {
    /** The lookup states the error for a name that does not exist. */
    getGpuSettingsPreset(id);
  }

  activePresetId = id;
  triggerEvent(eventTarget, Events.VOLUME_TEXTURE_LIMITS_CHANGED);
}

/**
 * The GPU settings that apply now. Under `auto`, the first call can run the
 * startup probe, also with final downsampling off. The render paths read
 * `gpuSettingsForRender` instead.
 */
function getActiveGpuSettings(): GpuSettings {
  return getGpuSettingsPreset(activePresetId);
}

/**
 * The GPU settings that a render applies, or `undefined` when no preset
 * applies: final downsampling is off, or the renderer is a software renderer
 * or CPU rendering (see `gpuSettingsApply`), whatever preset is active. With
 * `undefined`, a volume renders as in 4.x, with no probe and no read of the
 * record. Every render path reads the settings here, so that one check covers
 * them all.
 */
function gpuSettingsForRender(): GpuSettings | undefined {
  if (!getLossyDownsampling().final || !gpuSettingsApply()) {
    return undefined;
  }

  return getActiveGpuSettings();
}

/** Returns to the default preset, which is `auto`. */
function resetGpuSettingsPreset(): void {
  activePresetId = DEFAULT_PRESET_ID;
  triggerEvent(eventTarget, Events.VOLUME_TEXTURE_LIMITS_CHANGED);
}

/**
 * Runs a pending edge search of `auto` in the context of a viewport, before
 * the render of that viewport (see `isEdgeSearchPending`). The render window
 * calls this on each render, and it does nothing in the common case: the
 * startup probe already stored the edge.
 *
 * A new edge applies to the next provision: `VOLUME_TEXTURE_LIMITS_CHANGED`
 * fires after the render, not during it.
 *
 * @param gl - the context of the viewport that renders
 */
function runPendingEdgeSearch(gl: WebGL2RenderingContext): void {
  if (
    !isEdgeSearchPending() ||
    activePresetId !== 'auto' ||
    !gpuSettingsForRender()
  ) {
    return;
  }

  if (runEdgeSearchInContext(gl)) {
    setTimeout(() =>
      triggerEvent(eventTarget, Events.VOLUME_TEXTURE_LIMITS_CHANGED)
    );
  }
}

/**
 * The GPU settings of one texture under its share of the memory.
 *
 * `auto` states its memory limit for the GPU memory of the page. The strategy
 * gives each volume a share of it (see `fairShares`), and the texture gets
 * that share, never less than 32 MB. A named preset comes back as it is, and
 * its memory limits one texture.
 *
 * @param gpuSettings - the GPU settings that apply
 * @param shareBytes - the memory of this texture under `auto`
 */
function gpuSettingsForShare(
  gpuSettings: GpuSettings,
  shareBytes: number
): GpuSettings {
  if (
    gpuSettings.id !== 'auto' ||
    !Number.isFinite(gpuSettings.textureMemoryBytes)
  ) {
    return gpuSettings;
  }

  return {
    ...gpuSettings,
    textureMemoryBytes: Math.max(shareBytes, MIN_TEXTURE_BYTES),
  };
}

/**
 * The bytes of one voxel of a volume texture on the GPU, for the type of the
 * volume data. The strategy, the texture store and the allocation tracker all
 * count with this function.
 *
 * The volume buffer in memory holds 16-bit data as Float32, but the texture
 * that vtk.js uploads holds 2 bytes per value when it gets the norm16
 * extension, or when `rendering.preferSizeOverAccuracy` lets it upload half
 * float, and 4 bytes as float otherwise. `Uint8Array` takes 1 byte. Any other
 * type, signed bytes included, uploads as float, 4 bytes. With no type, the
 * count of values.
 *
 * @param dataType - the typed array of the volume data, such as 'Int16Array'
 * @param numberOfComponents - the components of one voxel
 * @param options.norm16 - whether the upload gets the norm16 extension; by
 * default the decision of the volume mappers (`getCanUseNorm16Texture`)
 */
function gpuTextureBytesPerVoxel(
  dataType: string | undefined,
  numberOfComponents = 1,
  { norm16 }: { norm16?: boolean } = {}
): number {
  const components = Math.max(numberOfComponents || 1, 1);

  if (!dataType) {
    return components;
  }

  switch (dataType) {
    case 'Uint8Array':
      return components;
    case 'Int16Array':
    case 'Uint16Array':
      return (
        ((norm16 ?? getCanUseNorm16Texture()) ||
        getConfiguration()?.rendering?.preferSizeOverAccuracy
          ? 2
          : 4) * components
      );
    default:
      return 4 * components;
  }
}

/**
 * The limits of one grid under some GPU settings.
 *
 * `maxEdge` is the limit on one axis. `maxVoxelCount` comes from the texture
 * memory and from the width of one voxel: a texture that the texture memory
 * cannot hold cannot work, whatever its shape. "The texture is too large" and
 * "there is not sufficient memory" give the same result to the user, so one
 * mechanism covers the two causes.
 *
 * @param gpuSettings - the settings that apply
 * @param bytesPerVoxel - the number of bytes of one voxel of the texture
 * @returns the limits that a grid must respect
 */
function gridLimitsOfGpuSettings(
  gpuSettings: GpuSettings,
  bytesPerVoxel: number
): VoxelGridLimits {
  const limits: VoxelGridLimits = { maxEdge: gpuSettings.maxTextureEdge };

  if (
    bytesPerVoxel > 0 &&
    gpuSettings.textureMemoryBytes > 0 &&
    Number.isFinite(gpuSettings.textureMemoryBytes)
  ) {
    limits.maxVoxelCount = Math.floor(
      gpuSettings.textureMemoryBytes / bytesPerVoxel
    );
  }

  return limits;
}

export {
  getGpuSettingsPreset,
  getGpuSettingsPresets,
  setGpuSettingsPreset,
  getActiveGpuSettings,
  gpuSettingsForRender,
  gpuSettingsForShare,
  runPendingEdgeSearch,
  resetGpuSettingsPreset,
  gridLimitsOfGpuSettings,
  gpuTextureBytesPerVoxel,
  gpuSettingsApply,
  getGpuMemoryLimit,
  setGpuMemoryLimit,
  resetGpuMemoryLimit,
  startMemoryBytes,
  DEFAULT_PRESET_ID as defaultGpuSettingsPresetId,
};
