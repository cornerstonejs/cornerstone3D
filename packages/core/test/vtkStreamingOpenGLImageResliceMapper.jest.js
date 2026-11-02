import { describe, it, expect, jest } from '@jest/globals';
import { getTransferFunctionsHash } from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow/resourceSharingHelper';
import { extend } from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLImageResliceMapper';
import gridFitsGpuSettings from '../src/RenderingEngine/vtkClasses/gridFitsGpuSettings';

jest.mock('../src/RenderingEngine/vtkClasses/gridFitsGpuSettings', () => ({
  __esModule: true,
  default: jest.fn(() => true),
}));

// The user experience must have this: after a context loss, a slice viewport
// draws the strategy texture, or black, and the draw never throws.

/** A WebGL context in which every member is a mock function. */
function mockContext() {
  return new Proxy({}, { get: (target, name) => (target[name] ??= jest.fn()) });
}

/** An OpenGL slice mapper node with the members that a build reads. */
function makeNode(scalarTexture) {
  const context = mockContext();
  const transferHash = getTransferFunctionsHash([null], false, 1);
  const renderWindow = {
    getContext: () => context,
    getWebgl2: () => true,
    activateTexture: jest.fn(),
    deactivateTexture: jest.fn(),
    registerGraphicsResourceUser: jest.fn(),
    unregisterGraphicsResourceUser: jest.fn(),
    setGraphicsResourceForObject: jest.fn(),
    // The transfer functions already have their textures.
    getGraphicsResourceForObject: (object) =>
      object === null
        ? { oglObject: { getHandle: () => 1 }, hash: transferHash }
        : undefined,
  };
  const publicAPI = {};
  const model = {};

  extend(publicAPI, model, {});
  Object.assign(model, {
    renderable: {
      getScalarTexture: () => scalarTexture,
      getSlabThickness: () => 0,
    },
    _openGLRenderWindow: renderWindow,
    context,
    numberOfComponents: 1,
    labelOutlineProperties: [],
    resliceGeom: { getMTime: () => 1 },
    tris: { getCABO: () => ({ getElementCount: () => 1 }) },
    VBOBuildString: '1A0',
  });

  return { publicAPI, model, renderWindow };
}

function makeInput(dimensions) {
  const scalars = {
    getMTime: () => 1,
    getNumberOfComponents: () => 1,
    getDataType: () => 'Uint16Array',
    getData: () => new Uint16Array(1),
  };
  const imageData = {
    getDimensions: () => dimensions,
    get: (key) => (key === 'dataType' ? { dataType: 'Uint16Array' } : {}),
    getPointData: () => ({ getScalars: () => scalars }),
  };
  const property = {
    getUpdatedExtents: () => [],
    getIndependentComponents: () => false,
    getRGBTransferFunction: () => null,
    getPiecewiseFunction: () => null,
  };

  return {
    inputs: [{ imageData, inputIndex: 0 }],
    actor: { getProperties: () => [property] },
  };
}

describe('vtkStreamingOpenGLImageResliceMapper', () => {
  it('binds the strategy texture that the renderable gets after the node exists', () => {
    const strategyTexture = {
      hasUpdatedFrames: () => false,
      getGrid: () => ({ dimensions: [256, 256, 1024] }),
      setOpenGLRenderWindow: jest.fn(),
      getTextureParameters: () => ({
        dataType: 'Uint16Array',
        width: 256,
        height: 256,
        depth: 1024,
      }),
      update3DFromRaw: jest.fn(),
    };
    const { publicAPI, model } = makeNode(strategyTexture);
    const { inputs, actor } = makeInput([512, 512, 2048]);

    // The node was made before the render path bound its texture.
    model.scalarTextures = [];
    model.currentValidInputs = inputs;
    publicAPI.buildBufferObjects({}, actor);

    expect(model.scalarTextures[0]).toBe(strategyTexture);
    expect(strategyTexture.update3DFromRaw).toHaveBeenCalled();
  });

  it('draws black and does not throw when the GPU settings refuse the full grid', () => {
    gridFitsGpuSettings.mockReturnValue(false);
    const { publicAPI, model, renderWindow } = makeNode(null);
    const { inputs, actor } = makeInput([512, 512, 2048]);

    model.currentValidInputs = inputs;

    expect(() => publicAPI.buildBufferObjects({}, actor)).not.toThrow();

    const texture = model.scalarTextures[0];

    expect(texture.getHandle()).toBeFalsy();
    expect(() => texture.activate()).not.toThrow();
    expect(renderWindow.activateTexture).toHaveBeenCalledWith(texture);
  });
});
