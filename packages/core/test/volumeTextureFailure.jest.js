import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockConfig = { rendering: {} };
const mockRecordFailure = jest.fn();
const mockAllocation = { error: 0, lost: false, throws: false, created: true };

jest.mock('../src/init', () => ({
  getConfiguration: () => mockConfig,
  recordVolumeTextureFailure: (...args) => mockRecordFailure(...args),
}));
jest.mock('../src/utilities/autoLoad', () => ({
  __esModule: true,
  default: jest.fn(),
}));
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
        publicAPI.create3DFromRaw = () => {
          if (mockAllocation.throws) {
            throw new Error('texStorage3D failed');
          }

          model.context.pendingError = mockAllocation.error;
          model.context.lost = mockAllocation.lost;
          model.allocatedGPUMemoryInBytes = 64;

          return mockAllocation.created;
        };
      },
    },
  };
});
jest.mock('../src/cache/cache', () => ({
  __esModule: true,
  default: { getVolume: () => undefined, getImage: () => undefined },
}));

import { extend } from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLTexture';

const OUT_OF_MEMORY = 0x0505;

/** A GL context that reports the error and the loss that a test sets. */
function createContext() {
  const gl = {
    NO_ERROR: 0,
    pendingError: 0,
    lost: false,
    getError: jest.fn(() => {
      const error = gl.pendingError;

      gl.pendingError = 0;

      return error;
    }),
    isContextLost: () => gl.lost,
  };

  return gl;
}

function createTexture() {
  const publicAPI = {};
  const model = {};
  const gl = createContext();

  extend(publicAPI, model, {
    context: gl,
    _openGLRenderWindow: { activateTexture: jest.fn() },
  });
  publicAPI.setVolumeId('ct');

  return { texture: publicAPI, gl };
}

const allocate = (texture) =>
  texture.create3DFromRaw({
    width: 4,
    height: 4,
    depth: 4,
    numComps: 1,
    dataType: 'Int16Array',
    data: new Int16Array(64),
  });

describe('the check of a 3D texture allocation', () => {
  beforeEach(() => {
    mockRecordFailure.mockClear();
    Object.assign(mockAllocation, {
      error: 0,
      lost: false,
      throws: false,
      created: true,
    });
    mockConfig.rendering = { planar: { sliceFirst: true } };
  });

  it('records nothing for an allocation that works', () => {
    const { texture } = createTexture();

    expect(allocate(texture)).toBe(true);
    expect(mockRecordFailure).not.toHaveBeenCalled();
  });

  it('records the volume when the context sets an error during the allocation', () => {
    const { texture, gl } = createTexture();

    gl.pendingError = OUT_OF_MEMORY;
    allocate(texture);

    expect(mockRecordFailure).not.toHaveBeenCalled();

    mockAllocation.error = OUT_OF_MEMORY;
    allocate(texture);

    expect(mockRecordFailure).toHaveBeenCalledTimes(1);
    expect(mockRecordFailure).toHaveBeenCalledWith('ct');
  });

  it('records the volume when the context is lost during the allocation, or vtk.js refuses it', () => {
    const { texture } = createTexture();

    mockAllocation.lost = true;
    allocate(texture);
    mockAllocation.lost = false;
    mockAllocation.created = false;
    allocate(texture);

    expect(mockRecordFailure).toHaveBeenCalledTimes(2);
  });

  it('records the volume and does not throw when the allocation throws', () => {
    const { texture } = createTexture();

    mockAllocation.throws = true;

    expect(allocate(texture)).toBe(false);
    expect(mockRecordFailure).toHaveBeenCalledWith('ct');
  });

  it('checks nothing and reads no GL error with slice first off', () => {
    const { texture, gl } = createTexture();

    mockConfig.rendering = { planar: { sliceFirst: false } };
    mockAllocation.error = OUT_OF_MEMORY;
    allocate(texture);

    expect(gl.getError).not.toHaveBeenCalled();
    expect(mockRecordFailure).not.toHaveBeenCalled();

    mockAllocation.throws = true;

    expect(() => allocate(texture)).toThrow('texStorage3D failed');
  });

  it('checks the allocation when the configuration does not name slice first', () => {
    const { texture } = createTexture();

    mockConfig.rendering = {};
    mockAllocation.error = OUT_OF_MEMORY;
    allocate(texture);

    expect(mockRecordFailure).toHaveBeenCalledWith('ct');
  });
});
