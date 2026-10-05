import type { VoxelGridLimits } from '../types';

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
 * A named capability profile, which an application states.
 *
 * This module adds no capability probe. `renderingCapabilities.ts` probes a
 * WebGL context, and this module does not. An application states which profile
 * applies, because a probe reports what a device claims, and a device can
 * overstate its memory. Task T15 adds the override of an overstated value.
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
const PROFILES: Record<GpuCapabilityProfileId, GpuCapabilityProfile> = {
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
    textureMemoryBytes: 16 * GIGABYTE,
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
 * `high` states an edge of 2048 and the largest memory of the shipped
 * profiles. The reported `MAX_3D_TEXTURE_SIZE` is not a reliable limit, so no
 * profile reads it: some Android devices report 2048 or more but render only
 * 256 per axis, and need `low` or `low-tablet`. Some Linux devices report more
 * than 2048, but no such device is tested to render beyond 2048, so
 * `high-texture-4096` stays internal.
 */
const DEFAULT_PROFILE_ID: GpuCapabilityProfileId = 'high';

let activeProfileId: GpuCapabilityProfileId = DEFAULT_PROFILE_ID;

/** Every profile, the internal one included. */
function getGpuCapabilityProfiles(): GpuCapabilityProfile[] {
  return Object.values(PROFILES);
}

/** The profile of one name. */
function getGpuCapabilityProfile(
  id: GpuCapabilityProfileId
): GpuCapabilityProfile {
  const profile = PROFILES[id];

  if (!profile) {
    throw new Error(`gpuCapabilityProfiles: there is no profile named ${id}`);
  }

  return profile;
}

/**
 * States which profile applies. An application calls this member, and nothing
 * probes a device to choose it.
 */
function setActiveGpuCapabilityProfile(id: GpuCapabilityProfileId): void {
  // The lookup states the error for a name that does not exist.
  getGpuCapabilityProfile(id);

  activeProfileId = id;
}

/** The profile that applies now. */
function getActiveGpuCapabilityProfile(): GpuCapabilityProfile {
  return getGpuCapabilityProfile(activeProfileId);
}

/** Returns the active profile to the default. */
function resetActiveGpuCapabilityProfile(): void {
  activeProfileId = DEFAULT_PROFILE_ID;
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
  getGpuCapabilityProfiles,
  setActiveGpuCapabilityProfile,
  getActiveGpuCapabilityProfile,
  resetActiveGpuCapabilityProfile,
  gridLimitsOfProfile,
  DEFAULT_PROFILE_ID as defaultGpuCapabilityProfileId,
};
