import type { VoxelGridLimits } from '../types';
import {
  ensureReliableEdge,
  getRendererClass,
  getRenderingCapabilities,
  peekStoredRenderingCapabilities,
  probeRenderingEdge,
} from './renderingCapabilities';
import type {
  RendererClass,
  RenderingCapabilityFailure,
  RenderingCapabilitySuccess,
} from './renderingCapabilities';
import type { ProbeTextureFormat } from './textureSupport';

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
 * renderer: `low` for a software rasterizer or no WebGL2, `low-tablet` for a
 * GPU of a phone or a tablet, and `medium` for any other GPU.
 */
const START_PRESET_OF_CLASS: Record<RendererClass, NamedPresetId> = {
  none: 'low',
  software: 'low',
  mobile: 'low-tablet',
  desktop: 'medium',
};

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
 * The memory limit of `auto`.
 *
 * With no failure, the limit is the larger of the start value and the reliable
 * value. With a failure, `auto` does not try the failed value again: the limit
 * is the larger of the reliable value (when it is below the failure) and of
 * the smaller of the start value and half of the failed value. A retest
 * removes the failure, and the limit returns to the first rule.
 */
function autoMemoryLimit(
  start: number,
  reliable?: RenderingCapabilitySuccess,
  failure?: RenderingCapabilityFailure
): number {
  if (!failure) {
    return Math.max(start, reliable?.value ?? 0);
  }

  const known = reliable && reliable.value < failure.value ? reliable.value : 0;

  return Math.max(known, Math.min(start, Math.floor(failure.value / 2)));
}

function smaller<T extends { value: number }>(a?: T, b?: T): T | undefined {
  if (!a || !b) {
    return a ?? b;
  }

  return a.value <= b.value ? a : b;
}

function larger<T extends { value: number }>(a?: T, b?: T): T | undefined {
  if (!a || !b) {
    return a ?? b;
  }

  return a.value >= b.value ? a : b;
}

/**
 * The edge of `auto`: the largest edge that a probe passed, and never an edge
 * that no probe passed. With no such edge, the edge search runs once in this
 * page (see `ensureReliableEdge`). When no probe can run, the edge is
 * `UNPROBED_EDGE_FLOOR`.
 */
function autoEdge(rendererClass: RendererClass): number {
  const reliable = ensureReliableEdge();
  const failed = peekStoredRenderingCapabilities()?.edge.failed?.value;
  const edge =
    reliable ??
    (failed && failed <= UNPROBED_EDGE_FLOOR
      ? FORMAT_PROBE_EDGE
      : UNPROBED_EDGE_FLOOR);

  // A software rasterizer is too slow for a larger texture.
  return rendererClass === 'software'
    ? Math.min(edge, PRESETS.low.maxTextureEdge)
    : edge;
}

/**
 * The `auto` preset, from the stored record of the device.
 *
 * The start preset of the class of the renderer (see `START_PRESET_OF_CLASS`)
 * gives the memory before the record holds any, and the speed. The edge is
 * the reliable edge of the probe (see `autoEdge`). The memory is the start
 * memory, raised by a larger total that worked, and lowered below a total at
 * which a context was lost or the tab stopped (see `autoMemoryLimit`). A
 * software rasterizer keeps the memory of `low`.
 */
function getAutoGpuSettings(): GpuSettings {
  const rendererClass = getRendererClass();
  const start = PRESETS[START_PRESET_OF_CLASS[rendererClass]];

  if (rendererClass === 'none') {
    return { ...start, id: 'auto' };
  }

  const stored = peekStoredRenderingCapabilities();
  const memory =
    rendererClass === 'software' || !stored
      ? start.textureMemoryBytes
      : autoMemoryLimit(
          start.textureMemoryBytes,
          larger(stored.textureBytes.reliable, stored.gpuBytes.reliable),
          smaller(stored.textureBytes.lost, stored.gpuBytes.crash)
        );

  return {
    id: 'auto',
    maxTextureEdge: autoEdge(rendererClass),
    textureMemoryBytes: memory,
    speed: start.speed,
  };
}

/**
 * Every preset: `auto` first, then the named presets, the internal one
 * included. The values of `auto` come from the stored record, so the first
 * call can run the probe.
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

/** The preset that applies now. */
function getActiveGpuSettings(): GpuSettings {
  return getGpuSettingsPreset(activePresetId);
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
  const rendererClass = getRendererClass();
  let result = gpuSettings;

  if (
    edge > gpuSettings.maxTextureEdge &&
    rendererClass !== 'software' &&
    rendererClass !== 'none'
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
  resetGpuSettingsPreset,
  gridLimitsOfGpuSettings,
  DEFAULT_PRESET_ID as defaultGpuSettingsPresetId,
};
