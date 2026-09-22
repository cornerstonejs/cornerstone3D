import { describe, it, expect, afterEach } from '@jest/globals';
import {
  getGpuCapabilityProfile,
  getGpuCapabilityProfiles,
  getActiveGpuCapabilityProfile,
  setActiveGpuCapabilityProfile,
  resetActiveGpuCapabilityProfile,
  gridLimitsOfProfile,
} from '../src/utilities/gpuCapabilityProfiles';

// The named capability profiles, which an application states. MR-CODE-1 and
// MR-CODE-2 of cornerstone3D issue #2921.
//
// The strategies that read a profile are in volumeRenderStrategy.jest.js.

const GIGABYTE = 1024 * 1024 * 1024;
afterEach(() => {
  resetActiveGpuCapabilityProfile();
});

describe('the capability profiles', () => {
  it('ships five profiles, and marks the control of the example as internal', () => {
    const profiles = getGpuCapabilityProfiles();

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
    expect(getGpuCapabilityProfile('low-tablet')).toEqual({
      id: 'low-tablet',
      maxTextureEdge: 256,
      textureMemoryBytes: 1 * GIGABYTE,
      speed: 10,
    });
    // Every known device holds a hard limit of 2048 for WebGL, so the three
    // shipped profiles above `low-tablet` differ only by memory.
    expect(getGpuCapabilityProfile('low').maxTextureEdge).toBe(2048);
    expect(getGpuCapabilityProfile('medium').maxTextureEdge).toBe(2048);
    expect(getGpuCapabilityProfile('high').maxTextureEdge).toBe(2048);
    expect(getGpuCapabilityProfile('low').textureMemoryBytes).toBe(
      8 * GIGABYTE
    );
    expect(getGpuCapabilityProfile('medium').textureMemoryBytes).toBe(
      16 * GIGABYTE
    );
    expect(getGpuCapabilityProfile('high').textureMemoryBytes).toBe(
      32 * GIGABYTE
    );
    // The speed is a relative index: 1 is software emulation of a GPU, and 100
    // is a recent top-of-the-line GPU. The scale has no upper bound.
    expect(getGpuCapabilityProfile('low').speed).toBe(30);
    expect(getGpuCapabilityProfile('medium').speed).toBe(60);
    expect(getGpuCapabilityProfile('high').speed).toBe(100);
    // The control of the example is the one profile with a larger edge.
    expect(getGpuCapabilityProfile('high-texture-4096').maxTextureEdge).toBe(
      4096
    );
  });

  it('takes the profile that an application states, and probes nothing', () => {
    expect(getActiveGpuCapabilityProfile().id).toBe('high');

    setActiveGpuCapabilityProfile('low-tablet');

    expect(getActiveGpuCapabilityProfile().id).toBe('low-tablet');
  });

  it('states an error for a name that does not exist', () => {
    expect(() => getGpuCapabilityProfile('enormous')).toThrow(
      'there is no profile named enormous'
    );
  });

  it('takes the limits of a grid from the edge and from the memory', () => {
    const limits = gridLimitsOfProfile(
      getGpuCapabilityProfile('low-tablet'),
      4
    );

    expect(limits.maxEdge).toBe(256);
    expect(limits.maxVoxelCount).toBe(GIGABYTE / 4);
  });
});
