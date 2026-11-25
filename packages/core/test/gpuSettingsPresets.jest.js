import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  jest,
} from '@jest/globals';
import {
  fairShares,
  reductionCauseOf,
  volumeTextureReductionFactors,
} from '../src/RenderingEngine/helpers/volumeRenderStrategy';
import { volumeTextureStore } from '../src/cache/volumeTextureStore';
import cache from '../src/cache/cache';
import {
  getGpuSettingsPreset,
  getGpuSettingsPresets,
  getActiveGpuSettings,
  setGpuSettingsPreset,
  resetGpuSettingsPreset,
  gridLimitsOfGpuSettings,
  gpuSettingsForShare,
  gpuSettingsForRender,
  runPendingEdgeSearch,
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
} from '../src/utilities/textureSupport';

jest.mock('../src/utilities/textureSupport', () => ({
  probeRenderingLimits: jest.fn(),
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
  it('starts a desktop GPU from 2 GB, with MAX_3D_TEXTURE_SIZE after a pass at 2048', () => {
    mockWebGL();

    /** The probe tests no edge above 2048, and 2048 passed. */
    expect(getActiveGpuSettings()).toEqual({
      id: 'auto',
      maxTextureEdge: 8192,
      textureMemoryBytes: 2 * GIGABYTE,
      speed: 60,
    });
    expect(probeRenderingLimits).toHaveBeenLastCalledWith(
      expect.objectContaining({ startEdge: 2048 })
    );
    expect(getStoredRenderingCapabilities().edge.reliable).toEqual({
      value: 8192,
      successes: 1,
      assumed: true,
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

  it('keeps the small start when an edge failure at 2048 or below removes the reliable edge', () => {
    mockWebGL();

    expect(getGpuMemoryLimit().bytes).toBe(2 * GIGABYTE);

    recordRenderingCapabilityFailure('edge', 1024);

    expect(getStoredRenderingCapabilities().edge.reliable).toBeUndefined();
    expect(getGpuMemoryLimit()).toEqual({
      bytes: GIGABYTE / 2,
      source: 'start',
      hard: false,
    });
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
      expect(getStoredRenderingCapabilities().edge.reliable.value).toBe(8192);
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

  describe('the fair share of the page', () => {
    /**
     * The API must do this: a display set that fits a fair share gets its
     * full need, and the large ones share the rest equally.
     */
    it('gives each small display set its need, and divides the rest', () => {
      expect(fairShares([100, 500, 900], 1200)).toEqual([100, 500, 600]);
      /** Three display sets that are all too large get equal shares. */
      expect(fairShares([900, 900, 900], 1200)).toEqual([400, 400, 400]);
      /**
       * The passes repeat: 400 is above 1000 / 3, but fits 900 / 2 after 100
       * left the budget. One pass would give 400 and 1000 each 450.
       */
      expect(fairShares([100, 400, 1000], 1000)).toEqual([100, 400, 500]);
      expect(fairShares([100, 200], 1000)).toEqual([100, 200]);
    });

    it('gives a texture its share under auto, never below 32 MB, and leaves a named preset as it is', () => {
      mockWebGL();

      expect(
        gpuSettingsForShare(getActiveGpuSettings(), 0.5 * GIGABYTE)
          .textureMemoryBytes
      ).toBe(0.5 * GIGABYTE);
      expect(
        gpuSettingsForShare(getActiveGpuSettings(), 0).textureMemoryBytes
      ).toBe(32 * MEGABYTE);
      expect(
        gpuSettingsForShare(getGpuSettingsPreset('low'), 0).textureMemoryBytes
      ).toBe(2 * GIGABYTE);
    });

    /**
     * The user experience must have this: a small display set draws at full
     * resolution whatever the load order, and only the large one is reduced.
     */
    it('draws a small PT at full resolution next to a large CT, in both load orders', () => {
      mockWebGL();
      setLossyDownsampling({ final: true });
      setGpuMemoryLimit({ bytes: 512 * MEGABYTE });

      const volume = (volumeId, dimensions) => ({
        volumeId,
        dataType: 'Float32Array',
        voxelGrid: { dimensions },
        voxelManager: { numberOfComponents: 1 },
        isDynamicVolume: () => false,
      });
      /** 32 MB as float, and 1 GB as float. */
      const pt = volume('pt', [128, 128, 512]);
      const ct = volume('ct', [512, 512, 1024]);
      const volumes = { pt, ct };
      const claimed = jest.spyOn(volumeTextureStore, 'claimedVolumeIds');
      const getVolume = jest
        .spyOn(cache, 'getVolume')
        .mockImplementation((volumeId) => volumes[volumeId]);

      try {
        for (const shown of [new Set(['ct']), new Set(['pt'])]) {
          claimed.mockReturnValue(shown);

          expect(
            volumeTextureReductionFactors(pt, getActiveGpuSettings())
          ).toEqual([1, 1, 1]);
          expect(
            volumeTextureReductionFactors(ct, getActiveGpuSettings()).some(
              (factor) => factor > 1
            )
          ).toBe(true);
        }
      } finally {
        claimed.mockRestore();
        getVolume.mockRestore();
        setLossyDownsampling({ final: false });
      }
    });

    /**
     * The API must do this: the share of a display set depends on the other
     * display sets, not only on its own size.
     */
    it('reduces a CT next to a PT that it holds at full resolution alone', () => {
      mockWebGL();
      setLossyDownsampling({ final: true });
      /** Just above the 1 GB of the CT, so the PT does not fit beside it. */
      setGpuMemoryLimit({ bytes: 1040 * MEGABYTE });

      const volume = (volumeId, dimensions) => ({
        volumeId,
        dataType: 'Float32Array',
        voxelGrid: { dimensions },
        voxelManager: { numberOfComponents: 1 },
        isDynamicVolume: () => false,
      });
      const pt = volume('pt', [128, 128, 512]);
      const ct = volume('ct', [512, 512, 1024]);
      const volumes = { pt, ct };
      const claimed = jest.spyOn(volumeTextureStore, 'claimedVolumeIds');
      const getVolume = jest
        .spyOn(cache, 'getVolume')
        .mockImplementation((volumeId) => volumes[volumeId]);

      try {
        claimed.mockReturnValue(new Set());

        expect(
          volumeTextureReductionFactors(ct, getActiveGpuSettings())
        ).toEqual([1, 1, 1]);

        claimed.mockReturnValue(new Set(['pt']));

        expect(
          volumeTextureReductionFactors(ct, getActiveGpuSettings()).some(
            (factor) => factor > 1
          )
        ).toBe(true);
      } finally {
        claimed.mockRestore();
        getVolume.mockRestore();
        setLossyDownsampling({ final: false });
      }
    });

    /**
     * The API must do this: two volumes that join in one batch were each
     * sized before the other was claimed, so their limits change.
     */
    it('changes the limits when two display sets join in one batch', async () => {
      mockWebGL();
      setLossyDownsampling({ final: true });

      const listener = jest.fn();
      const claimed = jest
        .spyOn(volumeTextureStore, 'claimedVolumeIds')
        .mockReturnValue(new Set());
      /** The display sets at the last check, and the check itself. */
      const store = volumeTextureStore;

      eventTarget.addEventListener(
        Events.VOLUME_TEXTURE_LIMITS_CHANGED,
        listener
      );

      try {
        store.displaySets = new Set();
        claimed.mockReturnValue(new Set(['ct']));
        store.noteClaimsChanged();
        await new Promise((resolve) => setTimeout(resolve));

        /** One volume alone was sized with the whole budget. */
        expect(listener).not.toHaveBeenCalled();

        store.displaySets = new Set();
        claimed.mockReturnValue(new Set(['ct', 'pt']));
        store.noteClaimsChanged();
        await new Promise((resolve) => setTimeout(resolve));

        expect(listener).toHaveBeenCalledTimes(1);
      } finally {
        eventTarget.removeEventListener(
          Events.VOLUME_TEXTURE_LIMITS_CHANGED,
          listener
        );
        claimed.mockRestore();
        setLossyDownsampling({ final: false });
      }
    });
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

    it('counts 16-bit data at 2 bytes with 16-bit float on, and the texture store counts the same', () => {
      mockWebGL();

      const grid = { dimensions: [64, 64, 64] };

      expect(volumeTextureStore.costOf(grid, 'Int16Array')).toBe(
        64 * 64 * 64 * 4
      );

      setConfiguration({
        ...getConfiguration(),
        rendering: {
          ...getConfiguration().rendering,
          preferSizeOverAccuracy: true,
        },
      });

      try {
        expect(gpuTextureBytesPerVoxel('Int16Array')).toBe(2);
        expect(volumeTextureStore.costOf(grid, 'Uint16Array')).toBe(
          64 * 64 * 64 * 2
        );
      } finally {
        setConfiguration({
          ...getConfiguration(),
          rendering: {
            ...getConfiguration().rendering,
            preferSizeOverAccuracy: false,
          },
        });
      }
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

    expect(getActiveGpuSettings().maxTextureEdge).toBe(8192);
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

  /**
   * The API must do this: a configured maximum edge below 2048 starts the
   * probe there, and the tested edge is not an assumed one.
   */
  it('starts the probe at the configured maximum edge', () => {
    mockWebGL();
    probeRenderingLimits.mockImplementation(({ startEdge }) => ({
      formats: { float: true, norm16: false },
      max3DTextureSize: 8192,
      reliableEdge: startEdge,
    }));
    setAutoGpuConfig({ maxTextureEdge: 1024 });

    expect(getActiveGpuSettings().maxTextureEdge).toBe(1024);
    expect(probeRenderingLimits).toHaveBeenLastCalledWith(
      expect.objectContaining({ startEdge: 1024 })
    );
    expect(getStoredRenderingCapabilities().edge.reliable).toEqual({
      value: 1024,
      successes: 1,
    });
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
});

describe('the edge search in the context of a viewport', () => {
  const gl = { viewport: 'gl' };
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
    probeEdgeSearch.mockReset();
    setLossyDownsampling({ final: true });
  }

  afterEach(() => setLossyDownsampling({ final: false }));

  /**
   * The API must do this: the render path creates no probe context. A retest
   * searches again in the context of the viewport, from the start edge.
   */
  it('runs a retest once, in the context of the viewport', () => {
    mockSmallEdgeDevice();
    probeEdgeSearch.mockReturnValue(edgeSearch);

    expect(getActiveGpuSettings().maxTextureEdge).toBe(128);
    runPendingEdgeSearch(gl);
    expect(probeEdgeSearch).not.toHaveBeenCalled();

    retestRenderingCapabilities({ edge: true });

    /** The old edge applies until the search ran. */
    expect(getActiveGpuSettings().maxTextureEdge).toBe(128);

    runPendingEdgeSearch(gl);
    runPendingEdgeSearch(gl);

    expect(probeEdgeSearch).toHaveBeenCalledTimes(1);
    /** The retest removed the failed edge, and starts at 2048 again. */
    expect(probeEdgeSearch).toHaveBeenCalledWith(
      gl,
      expect.objectContaining({ startEdge: 2048, belowEdge: undefined })
    );
    expect(getActiveGpuSettings().maxTextureEdge).toBe(128);
  });

  it('searches in the context of the viewport when the startup probe could not run, and applies the new edge', async () => {
    mockSmallEdgeDevice();
    probeRenderingLimits.mockReturnValue(null);
    probeEdgeSearch.mockReturnValue({
      max3DTextureSize: 8192,
      reliableEdge: 2048,
    });

    const listener = jest.fn();

    eventTarget.addEventListener(
      Events.VOLUME_TEXTURE_LIMITS_CHANGED,
      listener
    );

    try {
      /** The unprobed floor applies until the search ran. */
      expect(getActiveGpuSettings().maxTextureEdge).toBe(128);

      runPendingEdgeSearch(gl);

      expect(getActiveGpuSettings().maxTextureEdge).toBe(8192);
      /** The provisions follow after the render, not during it. */
      expect(listener).not.toHaveBeenCalled();
      await new Promise((resolve) => setTimeout(resolve));
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      eventTarget.removeEventListener(
        Events.VOLUME_TEXTURE_LIMITS_CHANGED,
        listener
      );
    }
  });

  it('starts below an edge whose test lost the context', () => {
    mockSmallEdgeDevice();
    probeRenderingLimits.mockReturnValue({
      formats: { float: true, norm16: false },
      max3DTextureSize: 8192,
      failedEdge: 2048,
      contextLost: true,
    });
    probeEdgeSearch.mockReturnValue(edgeSearch);

    getActiveGpuSettings();
    runPendingEdgeSearch(gl);

    expect(probeEdgeSearch).toHaveBeenCalledWith(
      gl,
      expect.objectContaining({ belowEdge: 2048 })
    );
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

describe('the record of the edge search', () => {
  const gl = { viewport: 'gl' };

  beforeEach(() => {
    probeEdgeSearch.mockReset();
    setLossyDownsampling({ final: true });
  });

  afterEach(() => setLossyDownsampling({ final: false }));

  it('keeps a failed edge that a search below it did not test', () => {
    mockWebGL();
    getActiveGpuSettings();
    recordRenderingCapabilityFailure('edge', 1024);
    probeEdgeSearch.mockReturnValue({
      max3DTextureSize: 8192,
      reliableEdge: 512,
    });

    runPendingEdgeSearch(gl);

    expect(probeEdgeSearch).toHaveBeenCalledWith(
      gl,
      expect.objectContaining({ belowEdge: 1024 })
    );
    expect(getStoredRenderingCapabilities().edge).toMatchObject({
      reliable: { value: 512, successes: 1 },
      failed: { value: 1024, failures: 1 },
    });
  });

  it('searches again from the new cap when maxTextureEdge rises', () => {
    setAutoGpuConfig({ maxTextureEdge: 1024 });
    mockWebGL();
    probeRenderingLimits.mockReturnValue({
      formats: { float: true, norm16: false },
      max3DTextureSize: 8192,
      reliableEdge: 1024,
    });

    expect(getActiveGpuSettings().maxTextureEdge).toBe(1024);
    expect(getStoredRenderingCapabilities().edge.searchedFrom).toBe(1024);

    runPendingEdgeSearch(gl);

    expect(probeEdgeSearch).not.toHaveBeenCalled();

    setAutoGpuConfig({});
    probeEdgeSearch.mockReturnValue({
      max3DTextureSize: 8192,
      reliableEdge: 2048,
    });
    runPendingEdgeSearch(gl);

    expect(probeEdgeSearch).toHaveBeenCalledWith(
      gl,
      expect.objectContaining({ startEdge: 2048 })
    );
    expect(getStoredRenderingCapabilities().edge.searchedFrom).toBe(2048);
  });
});
