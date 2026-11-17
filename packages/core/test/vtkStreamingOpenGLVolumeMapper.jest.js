import { describe, it, expect, jest } from '@jest/globals';
import { getTransferFunctionsHash } from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow/resourceSharingHelper';
import { extend } from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLVolumeMapper';

// The API must do this: a render path binds a strategy texture after the 3D
// node exists, and the node draws that texture.

/** A WebGL context in which every member is a mock function. */
function mockContext() {
  return new Proxy({}, { get: (target, name) => (target[name] ??= jest.fn()) });
}

/** A strategy texture that is already allocated at its grid. */
function strategyTexture() {
  return {
    hasUpdatedFrames: () => false,
    getGrid: () => ({ dimensions: [256, 256, 1024] }),
    getMTime: () => 5,
    getHandle: () => 1,
    setOpenGLRenderWindow: jest.fn(),
    enableUseHalfFloat: jest.fn(),
    getTextureParameters: () => ({
      dataType: 'Uint16Array',
      width: 256,
      height: 256,
      depth: 1024,
      numberOfComponents: 1,
    }),
    deactivate: jest.fn(),
    update3DFromRaw: jest.fn(),
  };
}

/** An OpenGL volume mapper node with the members that a build reads. */
function makeNode(initialTexture, bound) {
  const context = mockContext();
  const transferHash = getTransferFunctionsHash([null], false, 1);
  const publicAPI = {};
  const model = {};

  extend(publicAPI, model, { scalarTexture: initialTexture });
  Object.assign(model, {
    renderable: { getScalarTexture: () => bound.current },
    _openGLRenderWindow: {
      getContext: () => context,
      getWebgl2: () => true,
      activateTexture: jest.fn(),
      deactivateTexture: jest.fn(),
      registerGraphicsResourceUser: jest.fn(),
      unregisterGraphicsResourceUser: jest.fn(),
      setGraphicsResourceForObject: jest.fn(),
      // The transfer functions and the outline already have their textures.
      getGraphicsResourceForObject: (object) =>
        object === null
          ? { oglObject: { getHandle: () => 1 }, hash: transferHash }
          : Array.isArray(object)
            ? { oglObject: { getHandle: () => 1 }, hash: object.join('-') }
            : undefined,
    },
    context,
    jitterTexture: { getHandle: () => 1 },
    tris: { getCABO: () => ({ getElementCount: () => 1 }) },
    numberOfComponents: 1,
    useIndependentComponents: false,
    currentValidInputs: [
      {
        inputIndex: 0,
        imageData: {
          getMTime: () => 2,
          getDimensions: () => [512, 512, 2048],
          get: (key) =>
            key === 'dataType'
              ? { dataType: 'Uint16Array' }
              : { numberOfComponents: 1 },
          getPointData: () => ({ getScalars: () => null }),
        },
      },
    ],
  });

  const property = {
    getScalarOpacity: () => null,
    getRGBTransferFunction: () => null,
    getLabelOutlineThickness: () => [1],
  };
  const actor = {
    getProperties: () => [property],
    getProperty: () => property,
  };

  return { publicAPI, model, actor };
}

describe('vtkStreamingOpenGLVolumeMapper', () => {
  it('draws the strategy texture that the renderable gets after the node exists', () => {
    const full = strategyTexture();
    const reduced = strategyTexture();
    const bound = { current: full };
    const { publicAPI, model, actor } = makeNode(full, bound);

    publicAPI.buildBufferObjects({}, actor);
    bound.current = reduced;
    publicAPI.buildBufferObjects({}, actor);

    expect(model.scalarTextures[0]).toBe(reduced);
    expect(reduced.setOpenGLRenderWindow).toHaveBeenCalled();
    expect(reduced.update3DFromRaw).toHaveBeenCalled();
  });
});
