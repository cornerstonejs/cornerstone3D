import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockConfig = { rendering: {} };
const mockVolumes = new Map();

jest.mock('../src/init', () => ({
  getConfiguration: () => mockConfig,
}));
jest.mock('../src/cache/cache', () => ({
  __esModule: true,
  default: {
    getVolume: (volumeId) => mockVolumes.get(volumeId),
    getImage: () => undefined,
  },
}));

import { extend } from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLTexture';

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
function reducedTexture() {
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

  mockVolumes.set('vol', loadedVolume());
  publicAPI.setVolumeId('vol');
  publicAPI.setGrid({
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    spacing: [2, 2, 1],
    dimensions: [4, 4, depth],
  });
  publicAPI.markAllFramesUpdated();

  const uploadedSlices = () => gl.texSubImage3D.mock.calls.map((c) => c[4]);

  return { texture: publicAPI, uploadedSlices };
}

describe('vtkStreamingOpenGLTexture budgeted fill of a reduced texture', () => {
  beforeEach(() => {
    mockConfig.rendering = { reducedTextureFill: { maxSlicesPerRender: 2 } };
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
    mockConfig.rendering = { reducedTextureFill: { maxSlicesPerRender: 0 } };
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
});
