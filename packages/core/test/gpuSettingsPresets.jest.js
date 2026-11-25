import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  jest,
} from '@jest/globals';
import {
  reductionCauseOf,
  volumeTextureReductionFactors,
} from '../src/RenderingEngine/helpers/volumeRenderStrategy';
import {
  getGpuSettingsPreset,
  getGpuSettingsPresets,
  getActiveGpuSettings,
  setGpuSettingsPreset,
  resetGpuSettingsPreset,
  gridLimitsOfGpuSettings,
  gpuSettingsForGrid,
  gpuSettingsForRender,
  gpuTextureBytesPerVoxel,
  getGpuMemoryLimit,
  setGpuMemoryLimit,
  resetGpuMemoryLimit,
} from '../src/utilities/gpuSettingsPresets';
import eventTarget from '../src/eventTarget';
import Events from '../src/enums/Events';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import gridFitsGpuSettings from '../src/RenderingEngine/vtkClasses/gridFitsGpuSettings';
import { convertMapperToNotSharedMapper } from '../src/RenderingEngine/helpers/createVolumeMapper';
import * as gpuAllocationTracker from '../src/utilities/gpuAllocationTracker';
import {
  getConfiguration,
  getLossyDownsampling,
  resetUseCPURendering,
  setConfiguration,
  setLossyDownsampling,
  setUseCPURendering,
} from '../src/init';
import {
  getGpuMemoryEntryBytes,
  getGpuMemoryTotal,
  setGpuMemoryEntry,
} from '../src/utilities/gpuMemoryLedger';
import { newLedgerTexture } from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLImageResliceMapper';
import {
  getStoredRenderingCapabilities,
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

/**
 * The named capability presets, which an application states. MR-CODE-1 and
 * MR-CODE-2 of cornerstone3D issue #2921.
 *
 * The strategies that read a preset are in volumeRenderStrategy.jest.js.
 */

const MEGABYTE = 1024 * 1024;
const GIGABYTE = 1024 * MEGABYTE;
let getContextSpy;

/** Sets `rendering.autoGpuSettings` of the configuration. */
function setAutoGpuConfig(autoGpuSettings) {
  setConfiguration({
    ...getConfiguration(),
    rendering: { ...getConfiguration().rendering, autoGpuSettings },
  });
}

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
  resetGpuMemoryLimit();
  setAutoGpuConfig({});
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
    /**
     * `low` / `low-tablet` use a 256 policy edge so weak iGPUs reduce first;
     * `medium` and `high` keep 2048 and differ by memory.
     */
    expect(getGpuSettingsPreset('low').maxTextureEdge).toBe(256);
    expect(getGpuSettingsPreset('medium').maxTextureEdge).toBe(2048);
    expect(getGpuSettingsPreset('high').maxTextureEdge).toBe(2048);
    expect(getGpuSettingsPreset('low').textureMemoryBytes).toBe(2 * GIGABYTE);
    expect(getGpuSettingsPreset('medium').textureMemoryBytes).toBe(
      8 * GIGABYTE
    );
    expect(getGpuSettingsPreset('high').textureMemoryBytes).toBe(32 * GIGABYTE);
    /**
     * The speed is a relative index: 1 is software emulation of a GPU, and 100
     * is a recent top-of-the-line GPU. The scale has no upper bound.
     */
    expect(getGpuSettingsPreset('low').speed).toBe(30);
    expect(getGpuSettingsPreset('medium').speed).toBe(60);
    expect(getGpuSettingsPreset('high').speed).toBe(100);
    /** The control of the example is the one preset with a larger edge. */
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

describe('final downsampling off', () => {
  it('runs no probe under auto on any render path', () => {
    jest.clearAllMocks();
    mockWebGL();

    const dimensions = [16, 16, 3000];
    const imageData = vtkImageData.newInstance();

    imageData.setDimensions(dimensions);
    imageData.set(
      {
        voxelManager: {
          getCompleteScalarDataArray: () => new Float32Array(16 * 16 * 3000),
        },
      },
      true
    );
    const sharedMapper = vtkVolumeMapper.newInstance();

    sharedMapper.setInputData(imageData);

    expect(getLossyDownsampling().final).toBe(false);
    expect(gpuSettingsForRender()).toBeUndefined();
    expect(gridFitsGpuSettings(dimensions, 'Float32Array', 1)).toBe(true);
    convertMapperToNotSharedMapper(sharedMapper).delete();

    expect(probeRenderingLimits).not.toHaveBeenCalled();
    expect(probeTextureEdge).not.toHaveBeenCalled();
    expect(probeEdgeSearch).not.toHaveBeenCalled();
  });
});

describe('final downsampling on', () => {
  it('converts a real vtk.js mapper, and its delete removes the entry of the ledger', () => {
    mockWebGL();
    setLossyDownsampling({ final: true });

    try {
      const dimensions = [16, 16, 16];
      const imageData = vtkImageData.newInstance();

      imageData.setDimensions(dimensions);
      imageData.set(
        {
          id: 'converted-volume',
          voxelManager: {
            getCompleteScalarDataArray: () => new Float32Array(16 * 16 * 16),
          },
        },
        true
      );

      const sharedMapper = vtkVolumeMapper.newInstance();

      sharedMapper.setInputData(imageData);

      const mapper = convertMapperToNotSharedMapper(sharedMapper);

      expect(getGpuMemoryEntryBytes(mapper)).toBe(16 * 16 * 16 * 4);
      /** The entry carries the id of the volume, so its budget leaves it out. */
      expect(getGpuMemoryTotal('converted-volume')).toBe(
        getGpuMemoryTotal() - 16 * 16 * 16 * 4
      );

      /**
       * The labelmap edge projection replaces the scalars with a
       * two-component float array: the entry follows, and the larger upload
       * is noted first. An edit of the same size is no new upload.
       */
      const noted = jest.spyOn(gpuAllocationTracker, 'noteTextureAllocation');
      const scalars = mapper.getInputData().getPointData().getArray(0);

      scalars.setData(new Float32Array(2 * 16 * 16 * 16), 2);

      expect(getGpuMemoryEntryBytes(mapper)).toBe(2 * 16 * 16 * 16 * 4);
      expect(noted).toHaveBeenCalledWith(
        expect.objectContaining({
          textureBytes: 2 * 16 * 16 * 16 * 4,
          owner: mapper,
        })
      );

      noted.mockClear();
      scalars.modified();

      expect(noted).not.toHaveBeenCalled();
      noted.mockRestore();

      mapper.delete();

      expect(getGpuMemoryEntryBytes(mapper)).toBe(0);
    } finally {
      setLossyDownsampling({ final: false });
    }
  });
});

describe('the auto preset', () => {
  it('starts a desktop GPU from 2 GB, with the edge of the probe', () => {
    mockWebGL();

    expect(getActiveGpuSettings()).toEqual({
      id: 'auto',
      maxTextureEdge: 2048,
      textureMemoryBytes: 2 * GIGABYTE,
      speed: 60,
    });
    expect(getGpuMemoryLimit()).toEqual({
      bytes: 2 * GIGABYTE,
      source: 'start',
      hard: false,
    });
  });

  it('starts a phone or a tablet from the memory of low-tablet', () => {
    mockWebGL('Mali-G78');

    expect(getActiveGpuSettings().textureMemoryBytes).toBe(GIGABYTE);
  });

  it('starts from 0.5 GB when the probed edge is below 2048 and no memory is stored', () => {
    mockWebGL();
    probeRenderingLimits.mockReturnValue({
      formats: { float: true, norm16: false },
      max3DTextureSize: 8192,
      reliableEdge: 1024,
    });

    expect(getActiveGpuSettings().textureMemoryBytes).toBe(GIGABYTE / 2);

    resetRenderingCapabilities({ clearStorage: true });
    probeRenderingLimits.mockReturnValue({
      formats: { float: true, norm16: false },
      max3DTextureSize: 8192,
      reliableEdge: 2048,
    });

    expect(getActiveGpuSettings().textureMemoryBytes).toBe(2 * GIGABYTE);
  });

  describe('on a software renderer', () => {
    beforeEach(() => {
      mockWebGL('Google SwiftShader');
      setLossyDownsampling({ final: true });
    });

    afterEach(() => setLossyDownsampling({ final: false }));

    it('applies no auto limits, renders as 4.x, and runs no probe', () => {
      /** The detection at init runs its own probe; auto adds none. */
      getActiveGpuSettings();
      jest.clearAllMocks();

      expect(gpuSettingsForRender()).toBeUndefined();
      expect(gridFitsGpuSettings([16, 16, 3000], 'Float32Array', 1)).toBe(true);
      expect(getActiveGpuSettings().maxTextureEdge).toBe(Infinity);
      expect(probeTextureEdge).not.toHaveBeenCalled();
      expect(probeEdgeSearch).not.toHaveBeenCalled();
    });

    it('applies no named preset either', () => {
      setGpuSettingsPreset('low-tablet');

      expect(gpuSettingsForRender()).toBeUndefined();
      expect(gridFitsGpuSettings([16, 16, 3000], 'Float32Array', 1)).toBe(true);
    });
  });

  it('records failures and successes, and changes no limit by itself', () => {
    mockWebGL();
    recordRenderingCapabilitySuccess('textureBytes', 12 * GIGABYTE);
    recordRenderingCapabilityFailure('gpuBytes', GIGABYTE);
    recordRenderingCapabilityFailure('textureBytes', GIGABYTE);
    resetRenderingCapabilities();

    expect(getActiveGpuSettings().textureMemoryBytes).toBe(2 * GIGABYTE);
    expect(getStoredRenderingCapabilities().gpuBytes.failed.value).toBe(
      GIGABYTE
    );
  });

  describe('the limit choice', () => {
    beforeEach(() => mockWebGL());

    it('takes the configured start, then the user value, then a hard limit', () => {
      setAutoGpuConfig({ startMemoryBytes: 3 * GIGABYTE });

      expect(getGpuMemoryLimit()).toEqual({
        bytes: 3 * GIGABYTE,
        source: 'config',
        hard: false,
      });

      setGpuMemoryLimit({ bytes: 1.5 * GIGABYTE });

      expect(getGpuMemoryLimit()).toEqual({
        bytes: 1.5 * GIGABYTE,
        source: 'user',
        hard: false,
      });

      setGpuMemoryLimit({ bytes: 6 * GIGABYTE, hard: true });

      expect(getGpuMemoryLimit()).toEqual({
        bytes: 6 * GIGABYTE,
        source: 'hardUser',
        hard: true,
      });

      /** A hard limit of the configuration wins over the user. */
      setAutoGpuConfig({ hardMemoryBytes: 4 * GIGABYTE });

      expect(getGpuMemoryLimit()).toEqual({
        bytes: 4 * GIGABYTE,
        source: 'hardConfig',
        hard: true,
      });
      expect(getActiveGpuSettings().textureMemoryBytes).toBe(4 * GIGABYTE);
    });

    it('ignores a configured size below 128 MB', () => {
      setAutoGpuConfig({ startMemoryBytes: 64 * MEGABYTE });

      expect(getGpuMemoryLimit().source).toBe('start');
    });

    it('keeps the user value after a reload, and a reset keeps the edge', () => {
      setGpuMemoryLimit({ bytes: 768 * MEGABYTE });
      resetRenderingCapabilities();

      expect(getActiveGpuSettings().textureMemoryBytes).toBe(768 * MEGABYTE);

      resetGpuMemoryLimit();

      expect(getGpuMemoryLimit().source).toBe('start');
      expect(getStoredRenderingCapabilities().edge.reliable.value).toBe(2048);
    });

    it('refuses a limit below 128 MB', () => {
      expect(() => setGpuMemoryLimit({ bytes: 100 * MEGABYTE })).toThrow(
        'at least'
      );
      expect(() => setGpuMemoryLimit({ bytes: Number.NaN })).toThrow();
      expect(getGpuMemoryLimit().source).toBe('start');
    });

    it('applies a change at once through VOLUME_TEXTURE_LIMITS_CHANGED', () => {
      const listener = jest.fn();

      eventTarget.addEventListener(
        Events.VOLUME_TEXTURE_LIMITS_CHANGED,
        listener
      );

      try {
        setGpuMemoryLimit({ bytes: 4 * GIGABYTE });
        resetGpuMemoryLimit();

        expect(listener).toHaveBeenCalledTimes(2);
      } finally {
        eventTarget.removeEventListener(
          Events.VOLUME_TEXTURE_LIMITS_CHANGED,
          listener
        );
      }
    });

    it('sets the limit while WebGL is unavailable, for the next load', () => {
      getActiveGpuSettings();
      getContextSpy.mockRestore();
      getContextSpy = undefined;
      resetRenderingCapabilities();

      setGpuMemoryLimit({ bytes: 512 * MEGABYTE });

      mockWebGL();
      resetRenderingCapabilities();

      expect(getGpuMemoryLimit()).toEqual({
        bytes: 512 * MEGABYTE,
        source: 'user',
        hard: false,
      });
    });
  });

  it('gives a texture what the rest of the page leaves, and never below 32 MB', () => {
    mockWebGL();

    const settings = getActiveGpuSettings();

    expect(
      gpuSettingsForGrid(settings, [64, 64, 64], 2, 1.5 * GIGABYTE)
        .textureMemoryBytes
    ).toBe(0.5 * GIGABYTE);
    expect(
      gpuSettingsForGrid(settings, [64, 64, 64], 2, 3 * GIGABYTE)
        .textureMemoryBytes
    ).toBe(32 * MEGABYTE);

    /** A named preset limits one texture, whatever the page holds. */
    expect(
      gpuSettingsForGrid(
        getGpuSettingsPreset('low'),
        [64, 64, 64],
        2,
        3 * GIGABYTE
      ).textureMemoryBytes
    ).toBe(2 * GIGABYTE);
  });

  it('runs no probe for a caller that only decides', () => {
    mockWebGL();
    setLossyDownsampling({ final: true });

    try {
      const settings = gpuSettingsForRender({ probe: false });

      probeTextureEdge.mockClear();
      gpuSettingsForGrid(settings, [512, 512, 2464], 4, 0, { probe: false });

      expect(probeTextureEdge).not.toHaveBeenCalled();
    } finally {
      setLossyDownsampling({ final: false });
    }
  });

  describe('the bytes of a voxel on the GPU', () => {
    it('counts 16-bit data at 2 bytes with norm16, and at 4 bytes without', () => {
      mockWebGL();

      expect(gpuTextureBytesPerVoxel('Int16Array')).toBe(4);
      expect(gpuTextureBytesPerVoxel('Uint8Array')).toBe(1);
      expect(gpuTextureBytesPerVoxel('Float32Array', 2)).toBe(8);
      /** vtk.js uploads signed and clamped bytes as float. */
      expect(gpuTextureBytesPerVoxel('Int8Array')).toBe(4);
      expect(gpuTextureBytesPerVoxel('Uint8ClampedArray')).toBe(4);
      /** A path that hands vtk.js the extension states it. */
      expect(gpuTextureBytesPerVoxel('Uint16Array', 1, { norm16: true })).toBe(
        2
      );

      resetRenderingCapabilities({ clearStorage: true });
      probeRenderingLimits.mockReturnValue({
        formats: { float: true, norm16: true, norm16Linear: true },
        max3DTextureSize: 8192,
        reliableEdge: 2048,
      });

      expect(gpuTextureBytesPerVoxel('Int16Array')).toBe(2);
      expect(gpuTextureBytesPerVoxel('Uint16Array', 2)).toBe(4);
      expect(gpuTextureBytesPerVoxel('Int16Array', 1, { norm16: false })).toBe(
        4
      );
    });

    it('probes an unsigned 16-bit grid as unorm16, and a signed one as norm16', () => {
      mockWebGL();

      const settings = getActiveGpuSettings();

      probeTextureEdge.mockClear();
      gpuSettingsForGrid(settings, [512, 512, 2464], 2, 0, {
        dataType: 'Uint16Array',
      });
      gpuSettingsForGrid(settings, [512, 512, 3000], 2, 0, {
        dataType: 'Int16Array',
      });

      expect(probeTextureEdge.mock.calls).toEqual([
        [2464, 'unorm16'],
        [3000, 'norm16'],
      ]);
    });

    it('fits a 16-bit volume of 1 GB under a 2 GB limit with norm16', () => {
      mockWebGL();
      probeRenderingLimits.mockReturnValue({
        formats: { float: true, norm16: true, norm16Linear: true },
        max3DTextureSize: 8192,
        reliableEdge: 2048,
      });
      setLossyDownsampling({ final: true });

      try {
        const volume = {
          volumeId: 'ct',
          dataType: 'Int16Array',
          voxelGrid: { dimensions: [512, 512, 2048] },
          voxelManager: { numberOfComponents: 1 },
          isDynamicVolume: () => false,
        };

        expect(
          volumeTextureReductionFactors(volume, getActiveGpuSettings())
        ).toEqual([1, 1, 1]);
      } finally {
        setLossyDownsampling({ final: false });
      }
    });
  });

  describe('the cause of a reduction', () => {
    const volume = {
      volumeId: 'v',
      dataType: 'Uint16Array',
      voxelGrid: { dimensions: [512, 512, 2048] },
      voxelManager: { numberOfComponents: 1 },
      isDynamicVolume: () => false,
    };

    beforeEach(() => {
      mockWebGL();
      setLossyDownsampling({ final: true });
    });

    afterEach(() => setLossyDownsampling({ final: false }));

    it('is the memory limit when it reduces at least as much as the edge', () => {
      /**
       * With no norm16 here, 512 x 512 x 2048 at 16 bits uploads as float, 2
       * GB, which 768 MB cannot hold.
       */
      setGpuMemoryLimit({ bytes: 768 * MEGABYTE });

      expect(reductionCauseOf(volume, getActiveGpuSettings())).toBe(
        'memoryBudget'
      );
    });

    it('is the edge limit when the edge reduces more', () => {
      setGpuMemoryLimit({ bytes: 768 * MEGABYTE });
      setAutoGpuConfig({ maxTextureEdge: 256 });

      expect(reductionCauseOf(volume, getActiveGpuSettings())).toBe(
        'deviceTextureLimit'
      );
    });

    it('is none when nothing reduces', () => {
      expect(
        volumeTextureReductionFactors(volume, getActiveGpuSettings())
      ).toEqual([1, 1, 1]);
      expect(reductionCauseOf(volume, getActiveGpuSettings())).toBeUndefined();
    });
  });

  it('ignores a configured maximum edge that is not a positive number', () => {
    mockWebGL();
    setAutoGpuConfig({ maxTextureEdge: 0 });

    expect(getActiveGpuSettings().maxTextureEdge).toBe(2048);
  });

  it('gives the full-resolution reslice texture a ledger entry that its release removes', () => {
    const texture = newLedgerTexture();

    setGpuMemoryEntry(texture, { kind: 'texture', bytes: 1000 });
    expect(getGpuMemoryEntryBytes(texture)).toBe(1000);

    texture.releaseGraphicsResources();

    expect(getGpuMemoryEntryBytes(texture)).toBe(0);
    expect(texture.getClassName()).toBe('vtkOpenGLTexture');
    expect(Object.isFrozen(texture)).toBe(true);
  });

  it('probes no edge above the configured maximum edge', () => {
    mockWebGL();
    probeTextureEdge.mockClear();
    setAutoGpuConfig({ maxTextureEdge: 1024 });

    try {
      const settings = gpuSettingsForGrid(
        getActiveGpuSettings(),
        [512, 512, 2464],
        4
      );

      expect(probeTextureEdge).not.toHaveBeenCalled();
      expect(settings.maxTextureEdge).toBe(1024);
    } finally {
      setAutoGpuConfig({});
    }
  });

  it('classes "Apple GPU" on a Mac with no touch screen as a desktop', () => {
    const platform = jest
      .spyOn(navigator, 'platform', 'get')
      .mockReturnValue('MacIntel');

    try {
      mockWebGL('Apple GPU');

      expect(getActiveGpuSettings().textureMemoryBytes).toBe(2 * GIGABYTE);
    } finally {
      platform.mockRestore();
    }
  });

  it('reuses an edge that an earlier check passed, with settings from before it', () => {
    mockWebGL();
    probeTextureEdge.mockReturnValueOnce(true);

    const before = getActiveGpuSettings();

    gpuSettingsForGrid(before, [512, 512, 2464], 4);
    probeTextureEdge.mockClear();

    /** The second check holds the settings from before the probe. */
    const second = gpuSettingsForGrid(before, [512, 512, 2464], 4);

    expect(probeTextureEdge).not.toHaveBeenCalled();
    expect(second.maxTextureEdge).toBe(2464);
  });

  it('keeps a reset that the store refused, ahead of the stored limit', () => {
    mockWebGL();
    setGpuMemoryLimit({ bytes: 768 * MEGABYTE });

    const setItem = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    try {
      resetGpuMemoryLimit();
      /** A later write of the record reads the old limit back from the store. */
      recordRenderingCapabilitySuccess('gpuBytes', GIGABYTE);

      expect(getGpuMemoryLimit().source).toBe('start');
    } finally {
      setItem.mockRestore();
    }
  });

  it('keeps a limit that the store refused, ahead of the stored one', () => {
    mockWebGL();
    setGpuMemoryLimit({ bytes: 768 * MEGABYTE });

    const setItem = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    try {
      setGpuMemoryLimit({ bytes: 256 * MEGABYTE });

      expect(getGpuMemoryLimit()).toEqual({
        bytes: 256 * MEGABYTE,
        source: 'user',
        hard: false,
      });
    } finally {
      setItem.mockRestore();
    }
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

    /** A failed edge stays the limit until a retest. */
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

    /** The start edge of the class is 256, which no probe passed. */
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

    /** The search could not run either, so the edge is the unprobed floor. */
    expect(getActiveGpuSettings().maxTextureEdge).toBe(128);
    /** A search that could not run is not repeated in the same page. */
    getActiveGpuSettings();
    expect(probeEdgeSearch).toHaveBeenCalledTimes(1);

    /** The next page runs the search, and finds the edge. */
    resetRenderingCapabilities();

    expect(getActiveGpuSettings().maxTextureEdge).toBe(128);
    expect(probeEdgeSearch).toHaveBeenCalledTimes(2);
  });
});

describe('CPU rendering', () => {
  afterEach(() => {
    resetUseCPURendering();
    setLossyDownsampling({ final: false });
  });

  /**
   * The API must do this: the presets are WebGL GPU limits, so CPU rendering
   * renders as with final downsampling off.
   */
  it('applies no preset to CPU rendering', () => {
    mockWebGL();
    setLossyDownsampling({ final: true });
    setGpuSettingsPreset('low-tablet');

    expect(gpuSettingsForRender()?.id).toBe('low-tablet');

    setUseCPURendering(true, false);

    expect(gpuSettingsForRender()).toBeUndefined();
  });
});
