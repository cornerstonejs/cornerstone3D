import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';
import vtkCubeSource from '@kitware/vtk.js/Filters/Sources/CubeSource';
import getVtkDisplayCoords from '../src/utilities/getVtkDisplayCoords';
import { canvasToWorldContextPool } from '../src/RenderingEngine/helpers/vtkCanvasCoordinateTransforms';

/**
 * A viewport of the rendering engine as the function sees it: a canvas of
 * `canvasSize` device pixels and a renderer that covers `rendererViewport`
 * of a render window of `windowSize` pixels, which other viewports share.
 */
function makeViewport({ canvasSize, windowSize, rendererViewport }) {
  const renderer = vtkRenderer.newInstance();
  const renderWindow = vtkRenderWindow.newInstance();
  const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
  const canvas = document.createElement('canvas');

  renderer.setViewport(...rendererViewport);
  renderWindow.addRenderer(renderer);
  renderWindow.addView(openGLRenderWindow);
  openGLRenderWindow.setSize(...windowSize);
  canvas.width = canvasSize[0];
  canvas.height = canvasSize[1];

  return {
    renderer,
    viewport: {
      getCanvas: () => canvas,
      getRenderer: () => renderer,
    },
  };
}

/** Sets the device pixel ratio of the window for one test. */
function useDevicePixelRatio(ratio) {
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    value: ratio,
  });
}

describe('getVtkDisplayCoords', () => {
  afterEach(() => {
    useDevicePixelRatio(1);
  });

  it('gives the pixels from the bottom left corner, as the legacy member did, when the renderer covers the render window', () => {
    const { viewport } = makeViewport({
      canvasSize: [200, 100],
      windowSize: [200, 100],
      rendererViewport: [0, 0, 1, 1],
    });

    expect(getVtkDisplayCoords(viewport, [50, 20])).toEqual([50, 80, 0]);
  });

  it('places the point in the part of the render window that the renderer covers', () => {
    const atTheCorner = makeViewport({
      canvasSize: [200, 100],
      windowSize: [400, 300],
      rendererViewport: [0, 0, 0.5, 1 / 3],
    });
    const besideAnother = makeViewport({
      canvasSize: [200, 100],
      windowSize: [400, 300],
      rendererViewport: [0.5, 0, 1, 1 / 3],
    });
    const [x, y, z] = getVtkDisplayCoords(atTheCorner.viewport, [50, 20]);
    const [xBeside, yBeside] = getVtkDisplayCoords(
      besideAnother.viewport,
      [50, 20]
    );

    expect(x).toBeCloseTo(50, 9);
    expect(y).toBeCloseTo(80, 9);
    expect(z).toBe(0);
    expect(xBeside).toBeCloseTo(250, 9);
    expect(yBeside).toBeCloseTo(80, 9);
  });

  it('reads the canvas in device pixels', () => {
    useDevicePixelRatio(2);

    const { viewport } = makeViewport({
      canvasSize: [400, 200],
      windowSize: [400, 200],
      rendererViewport: [0, 0, 1, 1],
    });

    expect(getVtkDisplayCoords(viewport, [50, 20])).toEqual([100, 160, 0]);
  });

  it('lets a vtk.js picker find the prop under the canvas point of a renderer that covers a part of the render window', () => {
    const { renderer, viewport } = makeViewport({
      canvasSize: [200, 100],
      windowSize: [400, 300],
      rendererViewport: [0, 0, 0.5, 1 / 3],
    });
    const cube = vtkCubeSource.newInstance({
      xLength: 2,
      yLength: 2,
      zLength: 2,
    });
    const mapper = vtkMapper.newInstance();
    const actor = vtkActor.newInstance();
    const camera = renderer.getActiveCamera();
    const picker = vtkCellPicker.newInstance();

    mapper.setInputConnection(cube.getOutputPort());
    actor.setMapper(mapper);
    renderer.addActor(actor);
    camera.setParallelProjection(true);
    camera.setFocalPoint(0, 0, 0);
    camera.setPosition(0, 0, 10);
    camera.setViewUp(0, 1, 0);
    camera.setParallelScale(5);
    camera.setClippingRange(1, 20);
    picker.setTolerance(0);

    picker.pick(getVtkDisplayCoords(viewport, [105, 50]), renderer);

    expect(picker.getActors()).toEqual([actor]);

    const [x, y, z] = picker.getPickPosition();
    const [worldX, worldY] = canvasToWorldContextPool({
      canvas: viewport.getCanvas(),
      renderer,
      canvasPos: [105, 50],
    });

    expect(x).toBeCloseTo(0.5, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(1, 6);
    expect(x).toBeCloseTo(worldX, 6);
    expect(y).toBeCloseTo(worldY, 6);

    picker.pick(getVtkDisplayCoords(viewport, [130, 50]), renderer);

    expect(picker.getActors()).toEqual([]);
  });

  it('throws for a viewport without a vtk.js renderer', () => {
    const viewport = {
      getCanvas: () => document.createElement('canvas'),
      getRenderer: () => undefined,
    };

    expect(() => getVtkDisplayCoords(viewport, [0, 0])).toThrow(
      'the viewport has no vtk.js renderer in a render window'
    );
  });
});
