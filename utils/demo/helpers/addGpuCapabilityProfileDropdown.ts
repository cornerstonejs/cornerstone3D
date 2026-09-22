import {
  getActiveGpuCapabilityProfile,
  getGpuCapabilityProfiles,
  setActiveGpuCapabilityProfile,
} from '@cornerstonejs/core';
import type {
  GpuCapabilityProfile,
  GpuCapabilityProfileId,
} from '@cornerstonejs/core';
import addDropdownToToolbar from './addDropdownToToolbar';

interface configGpuCapabilityProfileDropdown {
  /** Called after the profile changes, so a page can reload its data. */
  onSelectedValueChange?: (profile: GpuCapabilityProfile) => void;
  /** The profile to select at the start. The active profile by default. */
  defaultValue?: GpuCapabilityProfileId;
  container?: HTMLElement;
  id?: string;
  labelText?: string;
}

const BYTES_IN_A_GIGABYTE = 1024 * 1024 * 1024;

/** Describes one profile in a form that a reader can compare at a glance. */
function describe(profile: GpuCapabilityProfile): string {
  const gigabytes = Math.round(
    profile.textureMemoryBytes / BYTES_IN_A_GIGABYTE
  );
  const internal = profile.internal ? ', internal' : '';

  return `${profile.id} (edge ${profile.maxTextureEdge}, ${gigabytes} GB, speed ${profile.speed}${internal})`;
}

/**
 * Adds a drop down that states which GPU capability profile applies.
 *
 * An application states a profile, and nothing probes the device. The profile
 * decides which render strategies a provider can build, so a page reloads its
 * data after a change: the strategies of a viewport are built when that
 * viewport adds its actor.
 *
 * `high` and `high-texture-4096` are the pair to compare. They describe the
 * same device, and only the edge of a texture differs, so one volume draws with
 * no reduction under `high-texture-4096` and with a reduction under `high`.
 */
export default function addGpuCapabilityProfileDropdown({
  onSelectedValueChange,
  defaultValue,
  container,
  id = 'gpuCapabilityProfile',
  labelText = 'GPU class',
}: configGpuCapabilityProfileDropdown = {}): void {
  const profiles = getGpuCapabilityProfiles();
  const map = new Map<string, GpuCapabilityProfile>(
    profiles.map((profile) => [describe(profile), profile])
  );
  const active = getActiveGpuCapabilityProfile();
  const selected = defaultValue
    ? profiles.find((profile) => profile.id === defaultValue)
    : active;

  addDropdownToToolbar({
    id,
    labelText,
    container,
    options: {
      map,
      defaultValue: describe(selected ?? active),
    },
    onSelectedValueChange: (_key, value) => {
      const profile = value as GpuCapabilityProfile;

      setActiveGpuCapabilityProfile(profile.id);
      onSelectedValueChange?.(profile);
    },
  });
}
