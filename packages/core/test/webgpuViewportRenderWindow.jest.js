jest.mock('@kitware/vtk.js/Rendering/Core/RenderWindow', () => ({
  newInstance: jest.fn(),
}));
jest.mock('@kitware/vtk.js/Rendering/Core/Renderer', () => ({
  newInstance: jest.fn(),
}));
jest.mock('@kitware/vtk.js/Rendering/WebGPU/RenderWindow', () => ({
  newInstance: jest.fn(),
}));
jest.mock('@kitware/vtk.js/Rendering/WebGPU/Profiles/All', () => ({}));
jest.mock('../src/RenderingEngine/renderingEngineCache', () => ({
  get: jest.fn(),
}));

import { renderWebGPUViewportWindow } from '../src/RenderingEngine/GenericViewport/Planar/webgpuViewportRenderWindow';

function createRenderFixture(initialized = true) {
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = 64;
  sourceCanvas.height = 64;

  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = 128;
  targetCanvas.height = 128;

  const targetContext = targetCanvas.getContext('2d');
  const drawImage = jest.spyOn(targetContext, 'drawImage');
  const onSubmittedWorkDone = jest.fn(() => new Promise(() => {}));
  let initializedCallback;

  const view = {
    getSize: jest.fn(() => [64, 64]),
    setSize: jest.fn(),
    getCanvas: jest.fn(() => sourceCanvas),
    getInitialized: jest.fn(() => initialized),
    getDevice: jest.fn(() => ({
      getHandle: jest.fn(),
      onSubmittedWorkDone,
    })),
    onInitialized: jest.fn((callback) => {
      initializedCallback = callback;
      return { unsubscribe: jest.fn() };
    }),
    traverseAllPasses: jest.fn(),
  };

  const entry = {
    view,
    destroyed: false,
  };

  return {
    drawImage,
    entry,
    getInitializedCallback: () => initializedCallback,
    onSubmittedWorkDone,
    targetCanvas,
    view,
  };
}

describe('renderWebGPUViewportWindow', () => {
  it('blits the submitted frame in the same task', () => {
    const fixture = createRenderFixture();
    const onBlitted = jest.fn();

    renderWebGPUViewportWindow(fixture.entry, fixture.targetCanvas, onBlitted);

    expect(fixture.view.traverseAllPasses).toHaveBeenCalledTimes(1);
    expect(fixture.drawImage).toHaveBeenCalledTimes(1);
    expect(fixture.onSubmittedWorkDone).not.toHaveBeenCalled();
    expect(onBlitted).toHaveBeenCalledTimes(1);
  });

  it('blits the first frame when WebGPU initialization completes', () => {
    const fixture = createRenderFixture(false);

    renderWebGPUViewportWindow(fixture.entry, fixture.targetCanvas);

    expect(fixture.drawImage).not.toHaveBeenCalled();

    fixture.getInitializedCallback()();

    expect(fixture.drawImage).toHaveBeenCalledTimes(1);
  });
});
