import { describe, it, expect, afterEach, jest } from '@jest/globals';
import {
  getGpuSettingsPreset,
  getGpuSettingsPresets,
  getActiveGpuSettings,
  setGpuSettingsPreset,
  resetGpuSettingsPreset,
  gridLimitsOfGpuSettings,
  gpuSettingsForGrid,
} from '../src/utilities/gpuSettingsPresets';
import {
  recordRenderingCapabilityFailure,
  recordRenderingCapabilitySuccess,
  resetRenderingCapabilities,
  retestRenderingCapabilities,
} from '../src/utilities/renderingCapabilities';
import {
  probeEdgeSearch,
  probeRenderingLimits,
  probeTextureEdge,
} from '../src/utilities/textureSupport';

jest.mock('../src/utilities/textureSupport', () => ({
  probeRenderingLimits: jest.fn(),
  probeTextureEdge: jest.fn(),
  probeEdgeSearch: jest.fn(),
}));

// The named capability presets, which an application states. MR-CODE-1 and
// MR-CODE-2 of cornerstone3D issue #2921.
//
// The strategies that read a preset are in volumeRenderStrategy.jest.js.

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
  resetGpuSettingsPreset();
  getContextSpy?.mockRestore();
  getContextSpy = undefined;
  resetRenderingCapabilities({ clearStorage: true });
});

describe('the capability presets', () => {
  it('ships auto and five named presets, and marks the control of the example as internal', () => {
    const presets = getGpuSettingsPresets();

    expect(presets.map((preset) => preset.id)).toEqual([
      'auto',
      'low-tablet',
      'low',
      'medium',
      'high',
      'high-texture-4096',
    ]);
    expect(
      presets.filter((preset) => preset.internal).map((p) => p.id)
    ).toEqual(['high-texture-4096']);
  });

  it('states the edge and the memory of each preset', () => {
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
    // The control of the example is the one preset with a larger edge.
    expect(getGpuSettingsPreset('high-texture-4096').maxTextureEdge).toBe(4096);
  });

  it('applies auto by default, and a named preset overrides auto', () => {
    mockWebGL();

    expect(getActiveGpuSettings().id).toBe('auto');

    setGpuSettingsPreset('low-tablet');

    expect(getActiveGpuSettings()).toEqual(getGpuSettingsPreset('low-tablet'));

    resetGpuSettingsPreset();

    expect(getActiveGpuSettings().id).toBe('auto');
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

describe('the auto preset', () => {
  it('starts a desktop GPU from medium, with the edge of the probe', () => {
    mockWebGL();

    expect(getActiveGpuSettings()).toEqual({
      id: 'auto',
      maxTextureEdge: 2048,
      textureMemoryBytes: 8 * GIGABYTE,
      speed: 60,
    });
  });

  it('starts a software rasterizer from low', () => {
    mockWebGL('Google SwiftShader');

    expect(getActiveGpuSettings()).toMatchObject({
      id: 'auto',
      maxTextureEdge: 256,
      textureMemoryBytes: 2 * GIGABYTE,
    });
  });

  it('takes the memory from the record, and stays below a failure', () => {
    mockWebGL();
    recordRenderingCapabilitySuccess('textureBytes', 12 * GIGABYTE);

    expect(getActiveGpuSettings().textureMemoryBytes).toBe(12 * GIGABYTE);

    // A crash above the reliable value keeps the reliable value.
    recordRenderingCapabilityFailure('gpuBytes', 14 * GIGABYTE);

    expect(getActiveGpuSettings().textureMemoryBytes).toBe(12 * GIGABYTE);

    // A context loss below the reliable value gives half of the failed value.
    recordRenderingCapabilityFailure('textureBytes', 6 * GIGABYTE);

    expect(getActiveGpuSettings().textureMemoryBytes).toBe(3 * GIGABYTE);
  });

  it('probes an edge that a grid needs before it raises the edge', () => {
    mockWebGL();
    probeTextureEdge.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const raised = gpuSettingsForGrid(
      getActiveGpuSettings(),
      [512, 512, 2464],
      4
    );

    expect(probeTextureEdge).toHaveBeenCalledWith(2464, 'float');
    expect(raised.maxTextureEdge).toBe(2464);

    // A failed edge stays the limit until a retest.
    const kept = gpuSettingsForGrid(raised, [512, 512, 4096], 4);

    expect(kept.maxTextureEdge).toBe(2464);
    gpuSettingsForGrid(kept, [512, 512, 5000], 4);
    expect(probeTextureEdge).toHaveBeenCalledTimes(2);
  });
});

describe('auto on a device that renders gray above an edge of 128', () => {
  const edgeSearch = {
    max3DTextureSize: 8192,
    reliableEdge: 128,
    failedEdge: 256,
  };

  function mockSmallEdgeDevice() {
    mockWebGL('Mali-G52');
    probeRenderingLimits.mockReturnValue({
      formats: { float: true, norm16: false },
      ...edgeSearch,
    });
    probeTextureEdge.mockReset();
    probeTextureEdge.mockImplementation((edge) => edge <= 128);
    probeEdgeSearch.mockReset();
  }

  it('never gives an edge above 128 after a retest of the edge', () => {
    mockSmallEdgeDevice();

    expect(getActiveGpuSettings().maxTextureEdge).toBe(128);

    retestRenderingCapabilities({ edge: true });

    // The start edge of the class is 256, which no probe passed.
    expect(getActiveGpuSettings().maxTextureEdge).toBe(128);

    const preset = gpuSettingsForGrid(
      getActiveGpuSettings(),
      [256, 256, 200],
      4
    );

    expect(probeTextureEdge).toHaveBeenCalledWith(256, 'float');
    expect(preset.maxTextureEdge).toBe(128);
  });

  it('searches the edge again when the first probe could not run', () => {
    mockSmallEdgeDevice();
    probeRenderingLimits.mockReturnValue(null);
    probeEdgeSearch.mockReturnValueOnce(null).mockReturnValue(edgeSearch);

    // The search could not run either, so the edge is the unprobed floor.
    expect(getActiveGpuSettings().maxTextureEdge).toBe(128);
    // A search that could not run is not repeated in the same page.
    getActiveGpuSettings();
    expect(probeEdgeSearch).toHaveBeenCalledTimes(1);

    // The next page runs the search, and finds the edge.
    resetRenderingCapabilities();

    expect(getActiveGpuSettings().maxTextureEdge).toBe(128);
    expect(probeEdgeSearch).toHaveBeenCalledTimes(2);
  });
});
