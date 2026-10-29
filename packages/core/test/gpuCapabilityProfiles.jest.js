import { describe, it, expect, afterEach, jest } from '@jest/globals';
import {
  getGpuCapabilityProfile,
  getGpuCapabilityProfiles,
  getActiveGpuCapabilityProfile,
  setActiveGpuCapabilityProfile,
  resetActiveGpuCapabilityProfile,
  gridLimitsOfProfile,
  profileForGrid,
} from '../src/utilities/gpuCapabilityProfiles';
import {
  recordRenderingCapabilityFailure,
  recordRenderingCapabilitySuccess,
  resetRenderingCapabilities,
} from '../src/utilities/renderingCapabilities';
import {
  probeRenderingLimits,
  probeTextureEdge,
} from '../src/utilities/textureSupport';

jest.mock('../src/utilities/textureSupport', () => ({
  probeRenderingLimits: jest.fn(),
  probeTextureEdge: jest.fn(),
}));

// The named capability profiles, which an application states. MR-CODE-1 and
// MR-CODE-2 of cornerstone3D issue #2921.
//
// The strategies that read a profile are in volumeRenderStrategy.jest.js.

const GIGABYTE = 1024 * 1024 * 1024;
let getContextSpy;

/** A WebGL2 context of one renderer, which is all that the detection reads. */
function mockWebGL(renderer = 'NVIDIA GeForce RTX 3080') {
  const gl = {
    getParameter: (param) => (param === 'unmasked-renderer' ? renderer : 16384),
    getExtension: (name) =>
      name === 'WEBGL_debug_renderer_info'
        ? { UNMASKED_RENDERER_WEBGL: 'unmasked-renderer' }
        : null,
  };

  getContextSpy = jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation((type) => (type === 'webgl2' ? gl : null));
  probeRenderingLimits.mockReturnValue({
    formats: { float: true, norm16: false },
    max3DTextureSize: 8192,
    reliableEdge: 2048,
  });
}

afterEach(() => {
  resetActiveGpuCapabilityProfile();
  getContextSpy?.mockRestore();
  getContextSpy = undefined;
  resetRenderingCapabilities({ clearStorage: true });
});

describe('the capability profiles', () => {
  it('ships auto and five named profiles, and marks the control of the example as internal', () => {
    const profiles = getGpuCapabilityProfiles();

    expect(profiles.map((profile) => profile.id)).toEqual([
      'auto',
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
    // `low` / `low-tablet` use a 256 policy edge so weak iGPUs reduce first;
    // `medium` and `high` keep 2048 and differ by memory.
    expect(getGpuCapabilityProfile('low').maxTextureEdge).toBe(256);
    expect(getGpuCapabilityProfile('medium').maxTextureEdge).toBe(2048);
    expect(getGpuCapabilityProfile('high').maxTextureEdge).toBe(2048);
    expect(getGpuCapabilityProfile('low').textureMemoryBytes).toBe(
      2 * GIGABYTE
    );
    expect(getGpuCapabilityProfile('medium').textureMemoryBytes).toBe(
      8 * GIGABYTE
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

  it('applies auto by default, and a named profile overrides auto', () => {
    mockWebGL();

    expect(getActiveGpuCapabilityProfile().id).toBe('auto');

    setActiveGpuCapabilityProfile('low-tablet');

    expect(getActiveGpuCapabilityProfile()).toEqual(
      getGpuCapabilityProfile('low-tablet')
    );

    resetActiveGpuCapabilityProfile();

    expect(getActiveGpuCapabilityProfile().id).toBe('auto');
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

describe('the auto profile', () => {
  it('starts a desktop GPU from medium, with the edge of the probe', () => {
    mockWebGL();

    expect(getActiveGpuCapabilityProfile()).toEqual({
      id: 'auto',
      maxTextureEdge: 2048,
      textureMemoryBytes: 8 * GIGABYTE,
      speed: 60,
    });
  });

  it('starts a software rasterizer from low', () => {
    mockWebGL('Google SwiftShader');

    expect(getActiveGpuCapabilityProfile()).toMatchObject({
      id: 'auto',
      maxTextureEdge: 256,
      textureMemoryBytes: 2 * GIGABYTE,
    });
  });

  it('takes the memory from the record, and stays below a failure', () => {
    mockWebGL();
    recordRenderingCapabilitySuccess('textureBytes', 12 * GIGABYTE);

    expect(getActiveGpuCapabilityProfile().textureMemoryBytes).toBe(
      12 * GIGABYTE
    );

    // A crash above the reliable value keeps the reliable value.
    recordRenderingCapabilityFailure('gpuBytes', 14 * GIGABYTE);

    expect(getActiveGpuCapabilityProfile().textureMemoryBytes).toBe(
      12 * GIGABYTE
    );

    // A context loss below the reliable value gives half of the failed value.
    recordRenderingCapabilityFailure('textureBytes', 6 * GIGABYTE);

    expect(getActiveGpuCapabilityProfile().textureMemoryBytes).toBe(
      3 * GIGABYTE
    );
  });

  it('probes an edge that a grid needs before it raises the edge', () => {
    mockWebGL();
    probeTextureEdge.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const raised = profileForGrid(
      getActiveGpuCapabilityProfile(),
      [512, 512, 2464],
      4
    );

    expect(probeTextureEdge).toHaveBeenCalledWith(2464, 'float');
    expect(raised.maxTextureEdge).toBe(2464);

    // A failed edge stays the limit until a retest.
    const kept = profileForGrid(raised, [512, 512, 4096], 4);

    expect(kept.maxTextureEdge).toBe(2464);
    profileForGrid(kept, [512, 512, 5000], 4);
    expect(probeTextureEdge).toHaveBeenCalledTimes(2);
  });
});
