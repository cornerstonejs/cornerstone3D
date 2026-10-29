import { describe, it, expect, afterEach } from '@jest/globals';
import {
  getGpuSettingsPreset,
  getGpuSettingsPresets,
  getActiveGpuSettings,
  setGpuSettingsPreset,
  resetGpuSettingsPreset,
  gridLimitsOfGpuSettings,
} from '../src/utilities/gpuSettingsPresets';

// The named capability profiles, which an application states. MR-CODE-1 and
// MR-CODE-2 of cornerstone3D issue #2921.
//
// The strategies that read a profile are in volumeRenderStrategy.jest.js.

const GIGABYTE = 1024 * 1024 * 1024;
afterEach(() => {
  resetGpuSettingsPreset();
});

describe('the GPU settings presets', () => {
  it('ships five profiles, and marks the control of the example as internal', () => {
    const profiles = getGpuSettingsPresets();

    expect(profiles.map((profile) => profile.id)).toEqual([
      'low-tablet',
      'low',
      'medium',
      'high',
      'high-texture-4096',
    ]);
    expect(
      profiles.filter((profile) => profile.internal).map((p) => p.id)
    ).toEqual(['high-texture-4096']);
  });

  it('states the edge and the memory of each profile', () => {
    expect(getGpuSettingsPreset('low-tablet')).toEqual({
      id: 'low-tablet',
      maxTextureEdge: 256,
      textureMemoryBytes: 1 * GIGABYTE,
      speed: 10,
    });
    // `low` / `low-tablet` use a 256 policy edge so weak iGPUs reduce first;
    // `medium` and `high` keep 2048 and differ by memory.
    expect(getGpuSettingsPreset('low').maxTextureEdge).toBe(256);
    expect(getGpuSettingsPreset('medium').maxTextureEdge).toBe(2048);
    expect(getGpuSettingsPreset('high').maxTextureEdge).toBe(2048);
    expect(getGpuSettingsPreset('low').textureMemoryBytes).toBe(2 * GIGABYTE);
    expect(getGpuSettingsPreset('medium').textureMemoryBytes).toBe(
      8 * GIGABYTE
    );
    expect(getGpuSettingsPreset('high').textureMemoryBytes).toBe(32 * GIGABYTE);
    // The speed is a relative index: 1 is software emulation of a GPU, and 100
    // is a recent top-of-the-line GPU. The scale has no upper bound.
    expect(getGpuSettingsPreset('low').speed).toBe(30);
    expect(getGpuSettingsPreset('medium').speed).toBe(60);
    expect(getGpuSettingsPreset('high').speed).toBe(100);
    // The control of the example is the one profile with a larger edge.
    expect(getGpuSettingsPreset('high-texture-4096').maxTextureEdge).toBe(4096);
  });

  it('takes the profile that an application states, and probes nothing', () => {
    expect(getActiveGpuSettings().id).toBe('high');

    setGpuSettingsPreset('low-tablet');

    expect(getActiveGpuSettings().id).toBe('low-tablet');
  });

  it('states an error for a name that does not exist', () => {
    expect(() => getGpuSettingsPreset('enormous')).toThrow(
      'there is no preset named enormous'
    );
  });

  it('takes the limits of a grid from the edge and from the memory', () => {
    const limits = gridLimitsOfGpuSettings(
      getGpuSettingsPreset('low-tablet'),
      4
    );

    expect(limits.maxEdge).toBe(256);
    expect(limits.maxVoxelCount).toBe(GIGABYTE / 4);
  });
});
