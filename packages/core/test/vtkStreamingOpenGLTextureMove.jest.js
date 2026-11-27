import { describe, it, expect, jest, afterEach } from '@jest/globals';

jest.mock('../src/utilities/autoLoad', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../src/utilities/textureSupport', () => ({
  probeRenderingLimits: jest.fn(),
  probeEdgeSearch: jest.fn(),
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
          model.allocatedGPUMemoryInBytes =
            options.width * options.height * options.depth * 4;

          return true;
        };
      },
    },
  };
});

import { extend } from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLTexture';
import { noteTextureRendered } from '../src/utilities/gpuAllocationTracker';
import {
  acknowledgeGpuMemoryFailure,
  getLastGpuMemoryFailure,
} from '../src/utilities/gpuMemoryFailures';
import {
  detectRenderingCapabilities,
  resetRenderingCapabilities,
} from '../src/utilities/renderingCapabilities';
import { resetWebGLAvailability } from '../src/utilities/webglAvailability';
import { probeRenderingLimits } from '../src/utilities/textureSupport';
import { setLossyDownsampling } from '../src/init';
import eventTarget from '../src/eventTarget';
import Events from '../src/enums/Events';

const RENDERER = 'NVIDIA GeForce RTX 3080';
const EDGE = 256;
/** 64 MB of float voxels, the smallest allocation that the tracker notes. */
const BYTES = EDGE * EDGE * EDGE * 4;

/** A WebGL2 context of one renderer, and a detection with it. */
function detectWithWebGL() {
  const gl = {
    getParameter: (param) => (param === 'unmasked-renderer' ? RENDERER : 16384),
    getExtension: (name) =>
      name === 'WEBGL_debug_renderer_info'
        ? { UNMASKED_RENDERER_WEBGL: 'unmasked-renderer' }
        : null,
    getError: () => 0,
    isContextLost: () => false,
    texSubImage3D: jest.fn(),
  };

  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation((type) => (type === 'webgl2' ? gl : null));
  probeRenderingLimits.mockReturnValue({
    formats: { float: true, norm16: false },
    max3DTextureSize: 2048,
    reliableEdge: 2048,
  });
  detectRenderingCapabilities();

  return gl;
}

/** A texture in a context, with what an allocation reaches. */
function newTexture(gl) {
  const publicAPI = {};
  const model = {};

  extend(publicAPI, model, {
    context: gl,
    _openGLRenderWindow: { activateTexture: jest.fn() },
  });
  Object.assign(publicAPI, {
    createTexture: jest.fn(),
    bind: jest.fn(),
    deactivate: jest.fn(),
  });

  return publicAPI;
}

const upload = {
  width: EDGE,
  height: EDGE,
  depth: EDGE,
  numComps: 1,
  dataType: 'Float32Array',
  data: new Float32Array(EDGE * EDGE * EDGE),
};

describe('a texture that moves to another context', () => {
  afterEach(() => {
    acknowledgeGpuMemoryFailure();
    resetWebGLAvailability();
    resetRenderingCapabilities({ clearStorage: true });
    setLossyDownsampling({ final: false });
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('reports a context loss during its upload of the same shape as a GPU memory failure', () => {
    jest.useFakeTimers();
    setLossyDownsampling({ final: true });

    const gl = detectWithWebGL();
    const texture = newTexture(gl);

    /** The first upload draws and settles. */
    expect(texture.create3DFromRaw(upload)).toBe(true);
    noteTextureRendered(gl, [texture]);
    jest.advanceTimersByTime(5000);

    /** The texture moves: its storage goes, and the same shape uploads again. */
    texture.releaseGraphicsResources();
    expect(texture.create3DFromRaw(upload)).toBe(true);

    const failures = [];
    const listener = (event) => failures.push(event.detail);

    eventTarget.addEventListener(Events.GPU_MEMORY_FAILURE, listener);

    try {
      eventTarget.dispatchEvent(
        new CustomEvent(Events.WEBGL_CONTEXT_LOST, { detail: {} })
      );
    } finally {
      eventTarget.removeEventListener(Events.GPU_MEMORY_FAILURE, listener);
    }

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      kind: 'contextLost',
      textureBytes: BYTES,
      failedBytes: BYTES,
    });
    expect(getLastGpuMemoryFailure()?.kind).toBe('contextLost');
  });
});
