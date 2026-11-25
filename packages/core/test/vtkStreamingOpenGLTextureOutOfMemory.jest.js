import { describe, it, expect, jest } from '@jest/globals';

const mockAllocate = jest.fn();

jest.mock('../src/init', () => ({
  getConfiguration: () => ({ rendering: {} }),
  getShouldUseCPURendering: () => false,
  getLossyDownsampling: () => ({ final: true }),
}));
jest.mock('../src/utilities/autoLoad', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../src/utilities/gpuAllocationTracker', () => ({
  noteTextureAllocation: jest.fn(),
  checkTextureOutOfMemory: jest.fn(() => false),
}));
/** The superclass allocation alone, with the size that vtk.js records. */
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
        publicAPI.create3DFromRaw = (options) => {
          mockAllocate(options);
          model.allocatedGPUMemoryInBytes =
            options.width * options.height * options.depth * 4;

          return true;
        };
      },
    },
  };
});

import { extend } from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLTexture';
import { checkTextureOutOfMemory } from '../src/utilities/gpuAllocationTracker';
import { getGpuMemoryEntryBytes } from '../src/utilities/gpuMemoryLedger';

/** A texture with the parts of its context that an allocation reaches. */
function newTexture() {
  const publicAPI = {};
  const model = {};
  const gl = {
    texSubImage3D: jest.fn(),
    isContextLost: () => false,
  };

  extend(publicAPI, model, {
    context: gl,
    _openGLRenderWindow: { activateTexture: jest.fn() },
  });
  Object.assign(publicAPI, {
    createTexture: jest.fn(),
    bind: jest.fn(),
    deactivate: jest.fn(),
  });
  jest.spyOn(publicAPI, 'releaseGraphicsResources').mockImplementation(() => {
    model.allocatedGPUMemoryInBytes = 0;
  });

  return { texture: publicAPI, gl };
}

/** An allocation of a texture of this depth, as the mappers ask for it. */
const upload = (depth) => ({
  width: 256,
  height: 256,
  depth,
  numComps: 1,
  dataType: 'Float32Array',
  data: new Float32Array(256 * 256 * depth),
});

describe('a texture that runs out of GPU memory', () => {
  it('releases its storage, refuses the same shape, and allocates a new shape', () => {
    const { texture, gl } = newTexture();

    checkTextureOutOfMemory.mockReturnValueOnce(true);

    expect(texture.create3DFromRaw(upload(64))).toBe(false);
    expect(checkTextureOutOfMemory).toHaveBeenCalledWith(gl, texture, {
      textureBytes: 256 * 256 * 64 * 4,
      totalBytes: 256 * 256 * 64 * 4,
    });
    expect(texture.releaseGraphicsResources).toHaveBeenCalledTimes(1);
    expect(getGpuMemoryEntryBytes(texture)).toBe(0);

    /** The same shape asks the GPU for nothing until the shape changes. */
    mockAllocate.mockClear();

    expect(texture.create3DFromRaw(upload(64))).toBe(false);
    expect(mockAllocate).not.toHaveBeenCalled();

    expect(texture.create3DFromRaw(upload(32))).toBe(true);
    expect(mockAllocate).toHaveBeenCalledTimes(1);
    expect(getGpuMemoryEntryBytes(texture)).toBe(256 * 256 * 32 * 4);
  });
});
