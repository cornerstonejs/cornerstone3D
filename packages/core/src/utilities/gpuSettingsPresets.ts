import type { VoxelGridLimits } from '../types';
import {
  ensureReliableEdge,
  getRendererClass,
  getRenderingCapabilities,
  peekStoredRenderingCapabilities,
  probeRenderingEdge,
} from './renderingCapabilities';
import {
  activeMemoryCeiling,
  getPageMemoryReduction,
} from './renderingCapabilities';
import type {
  RendererClass,
  RenderingCapabilityMemory,
} from './renderingCapabilities';
import type { ProbeTextureFormat } from './textureSupport';
import {
  getConfiguration,
  getLossyDownsampling,
  getShouldUseCPURendering,
} from '../init';

/**
 * How fast a device of this class draws, on a relative scale.
 *
 * 1 is a slow CPU that emulates a GPU in software. 100 is a recent
 * top-of-the-line GPU at the time of writing. The scale has no upper bound, so
 * a device that is faster than anything available today takes a value above
 * 100, and no existing preset changes.
 *
 * The value is relative, and it states no number of frames for each second,
 * because a measurement of the frame rate belongs to task T14 and not to a
 * declared preset.
 */
export type GpuSpeedIndex = number;

/**
 * The GPU settings that the volume render reads: the limits that a texture must
 * respect, and the speed class of the device. They apply only when final
 * downsampling is on (see `rendering.lossyDownsampling.final`).
 *
 * A preset is a named set of these values. `auto` is the default preset, and
 * it computes its edge and memory from the stored record of the device (see
 * `getStoredRenderingCapabilities`). A named preset, which an application
 * selects, overrides `auto`.
 *
 * The `auto` limits are WebGL GPU limits. A software renderer and CPU
 * rendering get no `auto` limits (see `autoGpuLimitsApply`). A named preset
 * applies to every renderer, because the application selects it explicitly,
 * for example a test on a CI runner that uses SwiftShader.
 */
export type GpuSettings = {
  /** The name of the preset. */
  id: GpuSettingsPresetId;
  /**
   * The largest number of voxels that one axis of one texture can hold.
   * WebGL devices commonly report 2048; a preset may state a lower policy
   * edge so weak GPUs reduce before they lose the context.
   */
  maxTextureEdge: number;
  /** The number of bytes of texture memory that the device holds. */
  textureMemoryBytes: number;
  /** How fast this class of device draws. See `GpuSpeedIndex`. */
  speed: GpuSpeedIndex;
  /**
   * True for a preset that exists for a test, which an application must not
   * state in production.
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

const GIGABYTE = 1024 * 1024 * 1024;

/**
 * The presets.
 *
 * `medium` and `high` share the WebGL edge of 2048 and differ by memory.
 * `low` and `low-tablet` use a 256 policy edge so weak integrated GPUs
 * reduce large volumes before WebGL context loss; `low` states more memory
 * than `low-tablet`.
 *
 * `high-texture-4096` is the control of the example, and it is not a real
 * device. One volume renders with no reduction under `high-texture-4096` and
 * with a reduction under `high`, which shows that the reduction comes from the
 * limit and not from a defect.
 */
type NamedPresetId = Exclude<GpuSettingsPresetId, 'auto'>;

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
    // The control shares the device class of `high`; only its edge differs.
    speed: 100,
    internal: true,
  },
};

/**
 * The preset that applies when an application states none.
 *
 * `auto` reads the stored record of the device, which the probe and the
 * allocation tracker fill. The reported `MAX_3D_TEXTURE_SIZE` is not a
 * reliable limit, because some Android devices report 2048 or more but render
 * only 128 or 256 per axis; the probe tests the edge instead.
 */
const DEFAULT_PRESET_ID: GpuSettingsPresetId = 'auto';

let activePresetId: GpuSettingsPresetId = DEFAULT_PRESET_ID;

/**
 * The named preset that sets the conservative start of `auto` for a class of
 * GPU: `low-tablet` for a GPU of a phone or a tablet, and `medium` for any
 * other GPU.
 */
const START_PRESET_OF_CLASS: Record<
  Exclude<RendererClass, 'none' | 'software'>,
  NamedPresetId
> = {
  mobile: 'low-tablet',
  desktop: 'medium',
};

/**
 * True when the `auto` limits apply. They are WebGL GPU limits, so they apply
 * to GPU rendering only. A software renderer (class `software`) and CPU
 * rendering (class `none`, or `useCPURendering`) get no `auto` limits, and
 * render as with final downsampling off. A named preset still applies to them.
 */
function autoGpuLimitsApply(): boolean {
  if (getShouldUseCPURendering()) {
    return false;
  }

  const rendererClass = getRendererClass();

  return rendererClass === 'mobile' || rendererClass === 'desktop';
}

/**
 * The edge of `auto` when no probe has passed any edge, because no probe could
 * run. The smallest edge known to fail on a real device is above 128. When the
 * record states a failure at or below 128, the edge is 8, which the format
 * probe passed.
 */
const UNPROBED_EDGE_FLOOR = 128;
const FORMAT_PROBE_EDGE = 8;

/** The smallest texture memory that `auto` gives to a new texture. */
const MIN_TEXTURE_BYTES = 16 * 1024 * 1024;

/**
 * The default of the largest texture memory that `auto` tests. An assumption
 * about the likely devices, not a limit of a device.
 */
const DEFAULT_AUTO_MAX_TEXTURE_MEMORY_BYTES = 32 * GIGABYTE;

/**
 * How far above the normal level `auto` lets the page go. A total up to this
 * multiple of the largest total that worked is a test of the next step.
 */
const MEMORY_TEST_STEP = 2;

/**
 * The bounds of what `auto` tests, from `rendering.autoGpuSettings` of the
 * configuration. `MAX_3D_TEXTURE_SIZE` bounds the edge in any case, because no
 * probe runs above it.
 */
function autoTestBounds(): {
  maxTextureMemoryBytes: number;
  maxTextureEdge: number;
} {
  const bounds = getConfiguration()?.rendering?.autoGpuSettings;

  return {
    maxTextureMemoryBytes:
      bounds?.maxTextureMemoryBytes ?? DEFAULT_AUTO_MAX_TEXTURE_MEMORY_BYTES,
    maxTextureEdge: bounds?.maxTextureEdge ?? Number.POSITIVE_INFINITY,
  };
}

/**
 * The memory limit of `auto`, in GPU bytes of the page.
 *
 * The limit is the larger of the start value and `MEMORY_TEST_STEP` times the
 * normal level, the largest total that worked. So the limit rises one step
 * after each success above the earlier normal level. `maxTextureMemoryBytes`
 * of `rendering.autoGpuSettings` caps it, and so does a ceiling, which several
 * failure episodes set, until it expires (see `activeMemoryCeiling`). A failure
 * episode lowers it further for its time, and for the rest of a page that saw
 * it (see `getPageMemoryReduction`): one failure allows 1/2 of the failed
 * total, two allow 1/4, and three or more allow 1/8. The limit is never below
 * `MIN_TEXTURE_BYTES`.
 *
 * @param start - the memory of the start preset of the renderer class
 * @param records - the memory records (context loss and stopped tab)
 */
function autoMemoryLimit(
  start: number,
  records: RenderingCapabilityMemory[]
): number {
  const normal = Math.max(
    0,
    ...records.map((memory) => memory.normal?.value ?? 0)
  );
  let limit = Math.min(
    Math.max(start, MEMORY_TEST_STEP * normal),
    autoTestBounds().maxTextureMemoryBytes
  );

  for (const memory of records) {
    limit = Math.min(limit, activeMemoryCeiling(memory) ?? limit);
  }

  return Math.max(MIN_TEXTURE_BYTES, Math.min(limit, getPageMemoryReduction()));
}

/**
 * The edge of `auto`: the largest edge that a probe passed, and never an edge
 * that no probe passed. With no such edge, the edge search runs once in this
 * page (see `ensureReliableEdge`). When no probe can run, the edge is
 * `UNPROBED_EDGE_FLOOR`. `maxTextureEdge` of `rendering.autoGpuSettings` caps
 * the edge.
 */
function autoEdge(): number {
  const reliable = ensureReliableEdge();
  const failed = peekStoredRenderingCapabilities()?.edge.failed?.value;

  return Math.min(
    reliable ??
      (failed && failed <= UNPROBED_EDGE_FLOOR
        ? FORMAT_PROBE_EDGE
        : UNPROBED_EDGE_FLOOR),
    autoTestBounds().maxTextureEdge
  );
}

/**
 * The `auto` preset, from the stored record of the device.
 *
 * The start preset of the class of the GPU (see `START_PRESET_OF_CLASS`)
 * gives the memory before the record holds any, and the speed. The edge is
 * the reliable edge of the probe (see `autoEdge`). The memory is the start
 * memory, raised one step above a larger total that worked, capped after several failure
 * episodes, and lowered for the time of an episode (see `autoMemoryLimit`).
 *
 * When the `auto` limits do not apply (see `autoGpuLimitsApply`), `auto` has
 * no limit, reads no record and runs no probe.
 */
function getAutoGpuSettings(): GpuSettings {
  if (!autoGpuLimitsApply()) {
    return {
      id: 'auto',
      maxTextureEdge: Number.POSITIVE_INFINITY,
      textureMemoryBytes: Number.POSITIVE_INFINITY,
      speed: 1,
    };
  }

  const start =
    PRESETS[START_PRESET_OF_CLASS[getRendererClass() as 'mobile' | 'desktop']];
  const stored = peekStoredRenderingCapabilities();
  const memory = !stored
    ? start.textureMemoryBytes
    : autoMemoryLimit(start.textureMemoryBytes, [
        stored.textureBytes,
        stored.gpuBytes,
      ]);

  return {
    id: 'auto',
    maxTextureEdge: autoEdge(),
    textureMemoryBytes: memory,
    speed: start.speed,
  };
}

/**
 * Every preset: `auto` first, then the named presets, the internal one
 * included. The values of `auto` come from the stored record, so the first
 * call can run the probe, also with final downsampling off. No render path
 * calls this with final downsampling off.
 */
function getGpuSettingsPresets(): GpuSettings[] {
  return [getAutoGpuSettings(), ...Object.values(PRESETS)];
}

/** The preset of one name. `auto` reads the stored record each time. */
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
 * States which preset applies. A named preset overrides `auto`, and
 * `resetGpuSettingsPreset` returns to `auto`.
 */
function setGpuSettingsPreset(id: GpuSettingsPresetId): void {
  if (id !== 'auto') {
    // The lookup states the error for a name that does not exist.
    getGpuSettingsPreset(id);
  }

  activePresetId = id;
}

/**
 * The preset that applies now. Under `auto`, a call can run the probe, also
 * with final downsampling off. The render paths read `gpuSettingsForRender`
 * instead, which runs no probe with final downsampling off.
 */
function getActiveGpuSettings(): GpuSettings {
  return getGpuSettingsPreset(activePresetId);
}

/**
 * The GPU settings that a render applies, or `undefined` when no preset
 * applies: final downsampling is off, or `auto` is active and its limits do
 * not apply (see `autoGpuLimitsApply`). With `undefined`, a volume renders as
 * in 4.x, with no probe and no read of the record. Every render path reads the
 * settings here, so that one check covers them all.
 */
function gpuSettingsForRender(): GpuSettings | undefined {
  if (
    !getLossyDownsampling().final ||
    (activePresetId === 'auto' && !autoGpuLimitsApply())
  ) {
    return undefined;
  }

  return getActiveGpuSettings();
}

/** Returns the active preset to the default, which is `auto`. */
function resetGpuSettingsPreset(): void {
  activePresetId = DEFAULT_PRESET_ID;
}

/**
 * The preset that applies to a grid of these dimensions.
 *
 * Under `auto`, a grid with an edge above the reliable edge first runs the
 * probe at that edge, synchronously, before the real texture is allocated
 * (see `probeRenderingEdge`). The preset then comes from the updated record.
 *
 * `auto` states its memory limit for the texture bytes of the page, so the
 * texture of this grid gets the limit minus `otherTextureBytes`, the bytes that
 * the other textures of the page already take. A named preset comes back as
 * it is, and its memory limits one texture.
 *
 * @param gpuSettings - the GPU settings that apply
 * @param dimensions - the number of voxels on each axis of the grid
 * @param bytesPerVoxel - the number of bytes of one voxel of the texture
 * @param otherTextureBytes - the texture bytes of the page that this grid
 * does not replace
 */
function gpuSettingsForGrid(
  gpuSettings: GpuSettings,
  dimensions: ArrayLike<number>,
  bytesPerVoxel: number,
  otherTextureBytes = 0
): GpuSettings {
  if (gpuSettings.id !== 'auto') {
    return gpuSettings;
  }

  const edge = Math.max(dimensions[0], dimensions[1], dimensions[2]);
  let result = gpuSettings;

  // An `auto` with no limits (see `autoGpuLimitsApply`) has an infinite edge,
  // so it never probes.
  if (
    edge > gpuSettings.maxTextureEdge &&
    edge <= autoTestBounds().maxTextureEdge
  ) {
    const format: ProbeTextureFormat =
      bytesPerVoxel === 1
        ? 'uint8'
        : bytesPerVoxel === 2
          ? getRenderingCapabilities().norm16
            ? 'norm16'
            : 'halfFloat'
          : 'float';

    if (probeRenderingEdge(edge, format)) {
      result = getAutoGpuSettings();
    }
  }

  if (otherTextureBytes <= 0) {
    return result;
  }

  return {
    ...result,
    textureMemoryBytes: Math.max(
      result.textureMemoryBytes - otherTextureBytes,
      MIN_TEXTURE_BYTES
    ),
  };
}

/**
 * The limits of one grid under one preset.
 *
 * `maxEdge` is the limit of the device on one axis. `maxVoxelCount` comes from
 * the memory of the device and from the width of one voxel: a texture that no
 * device can hold in its texture memory cannot work, whatever its shape. "The
 * texture is too large" and "there is not sufficient memory" give the same
 * result to the user, so one mechanism covers the two causes.
 *
 * @param gpuSettings - the GPU settings that apply
 * @param bytesPerVoxel - the number of bytes of one voxel of the texture
 * @returns the limits that a grid must respect
 */
function gridLimitsOfGpuSettings(
  gpuSettings: GpuSettings,
  bytesPerVoxel: number
): VoxelGridLimits {
  const limits: VoxelGridLimits = { maxEdge: gpuSettings.maxTextureEdge };

  if (bytesPerVoxel > 0 && gpuSettings.textureMemoryBytes > 0) {
    limits.maxVoxelCount = Math.floor(
      gpuSettings.textureMemoryBytes / bytesPerVoxel
    );
  }

  return limits;
}

export {
  getGpuSettingsPreset,
  gpuSettingsForGrid,
  getGpuSettingsPresets,
  setGpuSettingsPreset,
  getActiveGpuSettings,
  gpuSettingsForRender,
  resetGpuSettingsPreset,
  gridLimitsOfGpuSettings,
  autoGpuLimitsApply,
  DEFAULT_PRESET_ID as defaultGpuSettingsPresetId,
};
