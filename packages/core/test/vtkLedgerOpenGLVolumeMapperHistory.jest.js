import { describe, it, expect, jest, afterEach } from '@jest/globals';

jest.mock('@kitware/vtk.js/Rendering/OpenGL/VolumeMapper', () => ({
  __esModule: true,
  default: {
    /** A view node with no GL draw, so the factory can create it. */
    extend: (publicAPI, model, initialValues) => {
      jest
        .requireActual('@kitware/vtk.js/Rendering/SceneGraph/ViewNode')
        .default.extend(publicAPI, model, initialValues);
      model.classHierarchy.push('vtkOpenGLVolumeMapper');
      publicAPI.renderPieceDraw = jest.fn();
    },
  },
}));
jest.mock('../src/utilities/textureSupport', () => ({
  probeRenderingLimits: jest.fn(),
  probeEdgeSearch: jest.fn(),
}));

import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { extend } from '../src/RenderingEngine/vtkClasses/vtkLedgerOpenGLVolumeMapper';
import vtkStreamingOpenGLViewNodeFactory from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLViewNodeFactory';
import { convertMapperToNotSharedMapper } from '../src/RenderingEngine/helpers/createVolumeMapper';
import { noteTextureAllocation } from '../src/utilities/gpuAllocationTracker';
import {
  detectRenderingCapabilities,
  getStoredRenderingCapabilities,
  resetRenderingCapabilities,
} from '../src/utilities/renderingCapabilities';
import { probeRenderingLimits } from '../src/utilities/textureSupport';
import { setLossyDownsampling } from '../src/init';

const MEGABYTE = 1024 * 1024;
const RENDERER = 'NVIDIA GeForce RTX 3080';

/** A WebGL2 context of one renderer, and a detection with it. */
function detectWithWebGL() {
  const gl = {
    getParameter: (param) => (param === 'unmasked-renderer' ? RENDERER : 16384),
    getExtension: (name) =>
      name === 'WEBGL_debug_renderer_info'
        ? { UNMASKED_RENDERER_WEBGL: 'unmasked-renderer' }
        : null,
    isContextLost: () => false,
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

/**
 * The tracker and the record are the real ones here, so the draw of a
 * converted mapper is followed to the history of the record.
 */
describe('the draw of a converted volume mapper', () => {
  afterEach(() => {
    resetRenderingCapabilities({ clearStorage: true });
    setLossyDownsampling({ final: false });
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('settles the allocation of its volume mapper as a success in the history', () => {
    jest.useFakeTimers();
    setLossyDownsampling({ final: true });

    const gl = {
      getParameter: (param) =>
        param === 'unmasked-renderer' ? RENDERER : 16384,
      getExtension: (name) =>
        name === 'WEBGL_debug_renderer_info'
          ? { UNMASKED_RENDERER_WEBGL: 'unmasked-renderer' }
          : null,
      isContextLost: () => false,
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

    const volumeMapper = {};
    const publicAPI = {};

    extend(publicAPI, {}, { context: gl, renderable: volumeMapper });
    noteTextureAllocation({
      textureBytes: 512 * MEGABYTE,
      totalBytes: 600 * MEGABYTE,
      owner: volumeMapper,
    });
    publicAPI.renderPieceDraw('renderer', 'actor');
    jest.advanceTimersByTime(5000);

    const { history } = getStoredRenderingCapabilities();

    expect(history.largestLoad).toEqual({
      value: 600 * MEGABYTE,
      successes: 1,
    });
    expect(history.largestTexture).toEqual({
      value: 512 * MEGABYTE,
      successes: 1,
    });
  });

  it('follows a converted mapper from the factory to the history', () => {
    jest.useFakeTimers();
    setLossyDownsampling({ final: true });
    detectWithWebGL();

    /** A volume of 64 MB of float voxels, the smallest that is noted. */
    const dimensions = [256, 256, 256];
    const imageData = vtkImageData.newInstance();

    imageData.setDimensions(dimensions);
    imageData.set(
      {
        id: 'converted-volume',
        voxelManager: {
          getCompleteScalarDataArray: () => new Float32Array(256 * 256 * 256),
        },
      },
      true
    );

    const sharedMapper = vtkVolumeMapper.newInstance();

    sharedMapper.setInputData(imageData);

    const mapper = convertMapperToNotSharedMapper(sharedMapper);
    const node = vtkStreamingOpenGLViewNodeFactory
      .newInstance()
      .createNode(mapper);

    expect(node.isA('vtkLedgerOpenGLVolumeMapper')).toBe(true);

    /** The scene graph sets the renderable when it adds the node. */
    node.setRenderable(mapper);

    node.renderPieceDraw('renderer', 'actor');
    jest.advanceTimersByTime(5000);

    expect(getStoredRenderingCapabilities().history.largestTexture).toEqual({
      value: 256 * 256 * 256 * 4,
      successes: 1,
    });

    mapper.delete();
  });
});
