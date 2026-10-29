import type { VoxelGridLimits } from '../types';

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
 * preset.
 */
export type GpuSpeedIndex = number;

/**
 * The GPU settings that the volume render reads: the limits that a texture must
 * respect, and the speed class of the device.
 *
 * A preset is a named set of these values, which an application selects. A
 * preset does not describe a real device, and nothing probes the device to
 * choose one. The values apply only when final downsampling is on (see
 * `rendering.lossyDownsampling.final` of the configuration).
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
  /** The number of bytes of texture memory that a texture can use. */
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
 * `low` and `low-tablet` use an edge of 256, so that a weak integrated GPU
 * reduces a large volume before a WebGL context loss; `low` states more memory
 * than `low-tablet`.
 *
 * `high-texture-4096` is the control of the example, and it fits no real
 * device. One volume renders with no reduction under `high-texture-4096` and
 * with a reduction under `high`, which shows that the reduction comes from the
 * limit and not from a defect.
 */
const PRESETS: Record<GpuSettingsPresetId, GpuSettings> = {
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
    // The control shares the speed of `high`; only its edge differs.
    speed: 100,
    internal: true,
  },
};

/**
 * The preset that applies when an application selects none.
 *
 * `high` states an edge of 2048 and the largest memory of the presets. The
 * reported `MAX_3D_TEXTURE_SIZE` is not a reliable limit, so no preset reads
 * it: some Android devices report 2048 or more but render only 256 per axis,
 * and need `low` or `low-tablet`. Some Linux devices report more than 2048, but
 * no such device is tested to render beyond 2048, so `high-texture-4096` stays
 * internal.
 */
const DEFAULT_PRESET_ID: GpuSettingsPresetId = 'high';

let activePresetId: GpuSettingsPresetId = DEFAULT_PRESET_ID;

/** Every preset, the internal one included. */
function getGpuSettingsPresets(): GpuSettings[] {
  return Object.values(PRESETS);
}

/** The settings of one preset. */
function getGpuSettingsPreset(id: GpuSettingsPresetId): GpuSettings {
  const preset = Object.prototype.hasOwnProperty.call(PRESETS, id)
    ? PRESETS[id]
    : undefined;

  if (!preset) {
    throw new Error(`gpuSettingsPresets: there is no preset named ${id}`);
  }

  return preset;
}

/** Selects the preset that applies. Nothing probes a device to choose it. */
function setGpuSettingsPreset(id: GpuSettingsPresetId): void {
  // The lookup states the error for a name that does not exist.
  getGpuSettingsPreset(id);

  activePresetId = id;
}

/** The GPU settings that apply now. */
function getActiveGpuSettings(): GpuSettings {
  return getGpuSettingsPreset(activePresetId);
}

/** Returns to the default preset. */
function resetGpuSettingsPreset(): void {
  activePresetId = DEFAULT_PRESET_ID;
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

  if (bytesPerVoxel > 0 && gpuSettings.textureMemoryBytes > 0) {
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
  resetGpuSettingsPreset,
  gridLimitsOfGpuSettings,
  DEFAULT_PRESET_ID as defaultGpuSettingsPresetId,
};
