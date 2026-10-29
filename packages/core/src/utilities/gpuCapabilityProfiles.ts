import type { VoxelGridLimits } from '../types';
import {
  getRendererClass,
  getRenderingCapabilities,
  getStoredRenderingCapabilities,
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
 * 100, and no existing profile changes.
 *
 * The value is relative, and it states no number of frames for each second,
 * because a measurement of the frame rate belongs to task T14 and not to a
 * declared profile.
 */
export type GpuSpeedIndex = number;

/**
 * A capability profile.
 *
 * `auto` is the default. Its edge and memory come from the stored record of
 * the device (see `getStoredRenderingCapabilities`). A named profile, which an
 * application states, overrides `auto`.
 */
export type GpuCapabilityProfile = {
  /** The name of the profile. */
  id: GpuCapabilityProfileId;
  /**
   * The largest number of voxels that one axis of one texture can hold.
   * WebGL devices commonly report 2048; a profile may state a lower policy
   * edge so weak GPUs reduce before they lose the context.
   */
  maxTextureEdge: number;
  /** The number of bytes of texture memory that the device holds. */
  textureMemoryBytes: number;
  /** How fast this class of device draws. See `GpuSpeedIndex`. */
  speed: GpuSpeedIndex;
  /**
   * True for a profile that exists for a test, which an application must not
   * state in production.
   */
  internal?: boolean;
};

export type GpuCapabilityProfileId =
  | 'auto'
  | 'low-tablet'
  | 'low'
  | 'medium'
  | 'high'
  | 'high-texture-4096';

const GIGABYTE = 1024 * 1024 * 1024;

/**
 * The profiles.
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
type NamedProfileId = Exclude<GpuCapabilityProfileId, 'auto'>;

const PROFILES: Record<NamedProfileId, GpuCapabilityProfile> = {
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
 * The profile that applies when an application states none.
 *
 * `auto` reads the stored record of the device, which the probe and the
 * allocation tracker fill. The reported `MAX_3D_TEXTURE_SIZE` is not a
 * reliable limit, because some Android devices report 2048 or more but render
 * only 128 or 256 per axis; the probe tests the edge instead.
 */
const DEFAULT_PROFILE_ID: GpuCapabilityProfileId = 'auto';

let activeProfileId: GpuCapabilityProfileId = DEFAULT_PROFILE_ID;

/**
 * The named profile that sets the conservative start of `auto` for a class of
 * renderer: `low` for a software rasterizer or no WebGL2, `low-tablet` for a
 * GPU of a phone or a tablet, and `medium` for any other GPU.
 */
const START_PROFILE_OF_CLASS: Record<RendererClass, NamedProfileId> = {
  none: 'low',
  software: 'low',
  mobile: 'low-tablet',
  desktop: 'medium',
};

/**
 * The limit of `auto` for one value of the record.
 *
 * With no failure, the limit is the larger of the start value and the reliable
 * value. With a failure, `auto` does not try the failed value again: the limit
 * is the larger of the reliable value and of the smaller of the start value
 * and half of the failed value. A retest removes the failure.
 */
function autoLimit(
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

function smallerFailure(
  a?: RenderingCapabilityFailure,
  b?: RenderingCapabilityFailure
): RenderingCapabilityFailure | undefined {
  if (!a || !b) {
    return a ?? b;
  }

  return a.value <= b.value ? a : b;
}

/**
 * The `auto` profile, from the stored record of the device.
 *
 * The start profile of the class of the renderer (see `START_PROFILE_OF_CLASS`)
 * gives the values before the record holds any. The edge is the reliable edge
 * of the probe. The memory is the start memory, raised by a larger total that
 * worked, and lowered below a total at which a context was lost or the tab
 * stopped. A software rasterizer keeps the values of `low`, because it is too
 * slow for a larger texture.
 */
function getAutoGpuCapabilityProfile(): GpuCapabilityProfile {
  const rendererClass = getRendererClass();
  const start = PROFILES[START_PROFILE_OF_CLASS[rendererClass]];
  const stored = getStoredRenderingCapabilities();

  if (!stored || rendererClass === 'software' || rendererClass === 'none') {
    return { ...start, id: 'auto' };
  }

  const memoryReliable =
    stored.textureBytes.reliable?.value >=
    (stored.gpuBytes.reliable?.value ?? 0)
      ? stored.textureBytes.reliable
      : stored.gpuBytes.reliable;

  return {
    id: 'auto',
    maxTextureEdge: autoLimit(
      start.maxTextureEdge,
      stored.edge.reliable,
      stored.edge.failed
    ),
    textureMemoryBytes: autoLimit(
      start.textureMemoryBytes,
      memoryReliable,
      smallerFailure(stored.textureBytes.lost, stored.gpuBytes.crash)
    ),
    speed: start.speed,
  };
}

/** Every profile, `auto` and the internal one included. */
function getGpuCapabilityProfiles(): GpuCapabilityProfile[] {
  return [getAutoGpuCapabilityProfile(), ...Object.values(PROFILES)];
}

/** The profile of one name. `auto` reads the stored record each time. */
function getGpuCapabilityProfile(
  id: GpuCapabilityProfileId
): GpuCapabilityProfile {
  if (id === 'auto') {
    return getAutoGpuCapabilityProfile();
  }

  const profile = Object.prototype.hasOwnProperty.call(PROFILES, id)
    ? PROFILES[id]
    : undefined;

  if (!profile) {
    throw new Error(`gpuCapabilityProfiles: there is no profile named ${id}`);
  }

  return profile;
}

/**
 * States which profile applies. A named profile overrides `auto`, and
 * `resetActiveGpuCapabilityProfile` returns to `auto`.
 */
function setActiveGpuCapabilityProfile(id: GpuCapabilityProfileId): void {
  if (id !== 'auto') {
    // The lookup states the error for a name that does not exist.
    getGpuCapabilityProfile(id);
  }

  activeProfileId = id;
}

/** The profile that applies now. */
function getActiveGpuCapabilityProfile(): GpuCapabilityProfile {
  return getGpuCapabilityProfile(activeProfileId);
}

/** Returns the active profile to the default, which is `auto`. */
function resetActiveGpuCapabilityProfile(): void {
  activeProfileId = DEFAULT_PROFILE_ID;
}

/**
 * The profile that applies to a grid of these dimensions.
 *
 * Under `auto`, a grid with an edge above the reliable edge first runs the
 * probe at that edge, synchronously, before the real texture is allocated
 * (see `probeRenderingEdge`). The profile then comes from the updated record.
 * A named profile comes back as it is.
 *
 * @param profile - the profile that applies
 * @param dimensions - the number of voxels on each axis of the grid
 * @param bytesPerVoxel - the number of bytes of one voxel of the texture
 */
function profileForGrid(
  profile: GpuCapabilityProfile,
  dimensions: ArrayLike<number>,
  bytesPerVoxel: number
): GpuCapabilityProfile {
  if (profile.id !== 'auto') {
    return profile;
  }

  const edge = Math.max(dimensions[0], dimensions[1], dimensions[2]);
  const rendererClass = getRendererClass();

  if (
    edge <= profile.maxTextureEdge ||
    rendererClass === 'software' ||
    rendererClass === 'none'
  ) {
    return profile;
  }

  const format: ProbeTextureFormat =
    bytesPerVoxel === 1
      ? 'uint8'
      : bytesPerVoxel === 2
        ? getRenderingCapabilities().norm16
          ? 'norm16'
          : 'halfFloat'
        : 'float';

  return probeRenderingEdge(edge, format)
    ? getAutoGpuCapabilityProfile()
    : profile;
}

/**
 * The limits of one grid under one profile.
 *
 * `maxEdge` is the limit of the device on one axis. `maxVoxelCount` comes from
 * the memory of the device and from the width of one voxel: a texture that no
 * device can hold in its texture memory cannot work, whatever its shape. "The
 * texture is too large" and "there is not sufficient memory" give the same
 * result to the user, so one mechanism covers the two causes.
 *
 * @param profile - the profile that applies
 * @param bytesPerVoxel - the number of bytes of one voxel of the texture
 * @returns the limits that a grid must respect
 */
function gridLimitsOfProfile(
  profile: GpuCapabilityProfile,
  bytesPerVoxel: number
): VoxelGridLimits {
  const limits: VoxelGridLimits = { maxEdge: profile.maxTextureEdge };

  if (bytesPerVoxel > 0 && profile.textureMemoryBytes > 0) {
    limits.maxVoxelCount = Math.floor(
      profile.textureMemoryBytes / bytesPerVoxel
    );
  }

  return limits;
}

export {
  getGpuCapabilityProfile,
  profileForGrid,
  getGpuCapabilityProfiles,
  setActiveGpuCapabilityProfile,
  getActiveGpuCapabilityProfile,
  resetActiveGpuCapabilityProfile,
  gridLimitsOfProfile,
  DEFAULT_PROFILE_ID as defaultGpuCapabilityProfileId,
};
