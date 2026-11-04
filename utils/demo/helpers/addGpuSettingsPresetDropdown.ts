import {
  getActiveGpuSettings,
  getGpuSettingsPresets,
  setGpuSettingsPreset,
} from '@cornerstonejs/core';
import type {
  GpuSettings,
  GpuSettingsPresetId,
} from '@cornerstonejs/core';
import addDropdownToToolbar from './addDropdownToToolbar';

interface configGpuSettingsDropdown {
  /** Called after the preset changes, so a page can reload its data. */
  onSelectedValueChange?: (preset: GpuSettings) => void;
  /** The preset to select at the start. The active preset by default. */
  defaultValue?: GpuSettingsPresetId;
  container?: HTMLElement;
  id?: string;
  labelText?: string;
}

const BYTES_IN_A_MEGABYTE = 1024 * 1024;
const BYTES_IN_A_GIGABYTE = 1024 * 1024 * 1024;

/** Memory label for the drop-down (GB when at least 1 GB, otherwise MB). */
function formatMemory(bytes: number): string {
  if (bytes >= BYTES_IN_A_GIGABYTE) {
    const gigabytes = bytes / BYTES_IN_A_GIGABYTE;
    const rounded = Number.isInteger(gigabytes)
      ? String(gigabytes)
      : gigabytes.toFixed(1);

    return `${rounded} GB`;
  }

  return `${Math.round(bytes / BYTES_IN_A_MEGABYTE)} MB`;
}

/** Describes one preset in a form that a reader can compare at a glance. */
function describe(preset: GpuSettings): string {
  // The values of `auto` change as the device record grows, so the label
  // names the source and not the values.
  if (preset.id === 'auto') {
    return 'auto (from the stored device record)';
  }

  const internal = preset.internal ? ', internal' : '';

  return `${preset.id} (edge ${preset.maxTextureEdge}, ${formatMemory(preset.textureMemoryBytes)}, speed ${preset.speed}${internal})`;
}

/**
 * Adds a drop down that selects the GPU settings preset.
 *
 * `auto` is the default, and takes its limits from the stored record of the
 * device. A named preset overrides `auto`. The preset decides which render
 * strategies a provider can build, so a page reloads its data after a change:
 * the strategies of a viewport are built when that viewport adds its actor.
 *
 * `high` and `high-texture-4096` are the pair to compare. They describe the
 * same device, and only the edge of a texture differs, so one volume draws with
 * no reduction under `high-texture-4096` and with a reduction under `high`.
 */
export default function addGpuSettingsPresetDropdown({
  onSelectedValueChange,
  defaultValue,
  container,
  id = 'gpuSettingsPreset',
  labelText = 'GPU settings preset',
}: configGpuSettingsDropdown = {}): void {
  const presets = getGpuSettingsPresets();
  const map = new Map<string, GpuSettings>(
    presets.map((preset) => [describe(preset), preset])
  );
  const selected = defaultValue
    ? presets.find((preset) => preset.id === defaultValue)
    : undefined;

  // The drop-down shows the preset that applies, so a page that loads before
  // any change uses the preset that it shows.
  if (selected) {
    setGpuSettingsPreset(selected.id);
  }

  addDropdownToToolbar({
    id,
    labelText,
    container,
    options: {
      map,
      defaultValue: describe(getActiveGpuSettings()),
    },
    onSelectedValueChange: (_key, value) => {
      const preset = value as GpuSettings;

      setGpuSettingsPreset(preset.id);
      onSelectedValueChange?.(preset);
    },
  });
}
