import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockConfig = { rendering: {} };
const mockVolumes = new Map();

jest.mock('../src/init', () => ({
  getConfiguration: () => mockConfig,
}));
jest.mock('../src/utilities/autoLoad', () => ({
  __esModule: true,
  default: jest.fn(),
}));
// The real allocation needs a full GL context. This stands in for the
// superclass call alone, with the size that vtk.js records.
jest.mock('@kitware/vtk.js/Rendering/OpenGL/Texture', () => {
  const actual = jest.requireActual(
    '@kitware/vtk.js/Rendering/OpenGL/Texture'
  ).default;

  return {
    __esModule: true,
    default: {
      ...actual,
      extend: (publicAPI, model, initialValues) => {
        actual.extend(publicAPI, model, initialValues);
        publicAPI.create3DFromRaw = ({ width, height, depth, numComps }) => {
          model.allocatedGPUMemoryInBytes =
            width * height * depth * numComps * 4;
          return true;
        };
      },
    },
  };
});
jest.mock('../src/cache/cache', () => ({
  __esModule: true,
  default: {
    getVolume: (volumeId) => mockVolumes.get(volumeId),
    getImage: () => undefined,
  },
}));

import { extend } from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLTexture';
import autoLoad from '../src/utilities/autoLoad';

const depth = 8;
const frameLength = 4 * 4;

/** A loaded volume whose composite holds the reduced grid of the texture. */
function loadedVolume() {
  const voxels = new Float32Array(frameLength * depth);

  return {
    isDynamicVolume: () => false,
    dataType: 'Float32Array',
    voxelGrid: {
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      spacing: [1, 1, 1],
      dimensions: [8, 8, depth],
    },
    compositeVoxelManager: {
      getRepresentation: () => ({
        voxelManager: { getWritableScalarData: () => voxels },
      }),
    },
  };
}

/** A reduced texture of a mounted volume, with every slice waiting. */
function reducedTexture(volume = loadedVolume()) {
  const publicAPI = {};
  const model = {};
  const gl = { texSubImage3D: jest.fn() };

  extend(publicAPI, model, {
    context: gl,
    _openGLRenderWindow: { activateTexture: jest.fn() },
  });
  Object.assign(publicAPI, {
    createTexture: jest.fn(),
    bind: jest.fn(),
    deactivate: jest.fn(),
    updateArrayDataTypeForGL: (_type, data) => data,
  });

  mockVolumes.set('vol', volume);
  publicAPI.setVolumeId('vol');
  publicAPI.setGrid({
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    spacing: [2, 2, 1],
    dimensions: [4, 4, depth],
  });
  publicAPI.markAllFramesUpdated();

  const uploadedSlices = () => gl.texSubImage3D.mock.calls.map((c) => c[4]);

  return { texture: publicAPI, model, uploadedSlices };
}

/** A volume whose frames have not arrived, so no slice holds data. */
function emptyVolume() {
  const volume = loadedVolume();

  volume.compositeVoxelManager.getRepresentation = () => undefined;
  volume.dimensions = [8, 8, depth];

  return volume;
}

describe('vtkStreamingOpenGLTexture budgeted fill of a reduced texture', () => {
  // An unreachable time budget makes the slice budget the only limit, so the
  // tests do not depend on the speed of the machine.
  beforeEach(() => {
    mockConfig.rendering = {
      reducedTextureFill: {
        maxSlicesPerRender: 2,
        maxMillisecondsPerRender: Infinity,
      },
    };
  });

  // The user experience must have this: the slice that a view shows fills
  // first, and the view leaves `loading` when the last slice fills.
  it('starts the fill at the hint, and reports the fill as pending until it ends', () => {
    const { texture, uploadedSlices } = reducedTexture();

    texture.setFillHint(5);
    texture.update3DFromRaw();

    expect(uploadedSlices()).toEqual([5, 6]);
    expect(texture.isFillPending()).toBe(true);

    for (let render = 0; render < 3; render++) {
      texture.update3DFromRaw();
    }

    expect(uploadedSlices()).toHaveLength(depth);
    expect(texture.isFillPending()).toBe(false);
  });

  // The API must do this: a budget of 0 slices still fills.
  it('fills one slice for each render with a budget of 0 slices', () => {
    mockConfig.rendering = {
      reducedTextureFill: {
        maxSlicesPerRender: 0,
        maxMillisecondsPerRender: Infinity,
      },
    };
    const { texture, uploadedSlices } = reducedTexture();

    texture.update3DFromRaw();

    expect(uploadedSlices()).toEqual([0]);
  });

  // The API must do this: a texture fills with the statistic that it reports,
  // also after the volume changed its statistic.
  it('fills with the statistic of the texture, not a later one of the volume', () => {
    const { texture } = reducedTexture();
    const volume = mockVolumes.get('vol');
    const composite = volume.compositeVoxelManager;
    const getRepresentation = jest.spyOn(composite, 'getRepresentation');
    texture.setStatistic('max');
    volume.reductionStatistic = 'min';
    texture.update3DFromRaw();

    expect(getRepresentation).toHaveBeenCalledWith(expect.anything(), 'max');
  });

  // The API must do this: fresh storage reads 0, so an empty slice uploads
  // nothing and costs no budget, but a slice that held data still clears.
  it('skips the zero upload of a slice that new storage never received', () => {
    const volume = emptyVolume();
    const { texture, model, uploadedSlices } = reducedTexture(volume);
    // What create3DFromRaw does for an allocation with `data: null`.
    model.writtenSlices = new Uint8Array(depth);

    texture.update3DFromRaw();

    expect(uploadedSlices()).toEqual([]);
    expect(texture.isFillPending()).toBe(false);

    model.writtenSlices[3] = 1;
    texture.markAllFramesUpdated();
    texture.update3DFromRaw();

    expect(uploadedSlices()).toEqual([3]);
  });
});

describe('vtkStreamingOpenGLTexture storage fence', () => {
  let gl;

  /** A texture allocated with `data: null`, of 1 GB or of 4 MB. */
  function allocated(large) {
    const { texture, model, uploadedSlices } = reducedTexture();

    gl = Object.assign(model.context, {
      SYNC_GPU_COMMANDS_COMPLETE: 1,
      SYNC_STATUS: 2,
      SIGNALED: 3,
      fenceSync: jest.fn(() => ({})),
      getSyncParameter: jest.fn(() => 0),
      deleteSync: jest.fn(),
      flush: jest.fn(),
      isContextLost: () => false,
    });
    texture.create3DFromRaw({
      width: 512,
      height: 512,
      depth: large ? 1024 : 4,
      numComps: 1,
      dataType: 'Float32Array',
      data: null,
    });
    jest.spyOn(texture, 'modified');

    return { texture, uploadedSlices };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    autoLoad.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // The API must do this: a large allocation starts the clear, waits for the
  // fence with no upload, and renders the volume once the fence signals.
  it('waits on the fence of a large allocation, then renders the volume', () => {
    const { texture, uploadedSlices } = allocated(true);

    expect(gl.texSubImage3D.mock.calls[0].slice(5, 8)).toEqual([1, 1, 1]);
    expect(texture.isInitializing()).toBe(true);
    gl.texSubImage3D.mockClear();
    texture.update3DFromRaw();
    expect(uploadedSlices()).toEqual([]);

    jest.advanceTimersByTime(32);
    expect(texture.modified).not.toHaveBeenCalled();

    // A render that sees the signal first still gets the poll's render.
    gl.getSyncParameter.mockReturnValue(gl.SIGNALED);
    expect(texture.isInitializing()).toBe(false);
    jest.advanceTimersByTime(16);

    expect(gl.deleteSync).toHaveBeenCalledTimes(1);
    expect(texture.modified).toHaveBeenCalledTimes(1);
    expect(autoLoad).toHaveBeenCalledWith('vol');
    expect(jest.getTimerCount()).toBe(0);
  });

  // The user experience must have this: a small volume draws on its first
  // render, as before the fence.
  it('creates no fence for a small allocation', () => {
    const { texture } = allocated(false);

    expect(gl.fenceSync).not.toHaveBeenCalled();
    expect(gl.texSubImage3D).not.toHaveBeenCalled();
    expect(texture.isInitializing()).toBe(false);
  });

  // The user experience must have this: a fence that never signals cannot
  // leave the volume undrawn.
  it('ends the wait at the deadline', () => {
    const { texture } = allocated(true);

    jest.advanceTimersByTime(3100);

    expect(texture.isInitializing()).toBe(false);
    expect(gl.deleteSync).toHaveBeenCalledTimes(1);
    expect(autoLoad).toHaveBeenCalledWith('vol');
  });

  // The API must do this: the poll does not outlive the texture.
  it('cancels the poll when the texture is deleted', () => {
    const { texture } = allocated(true);
    const modified = texture.modified;

    texture.delete();
    jest.advanceTimersByTime(100);

    expect(jest.getTimerCount()).toBe(0);
    expect(gl.getSyncParameter).not.toHaveBeenCalled();
    expect(modified).not.toHaveBeenCalled();
    expect(autoLoad).not.toHaveBeenCalled();
  });
});
