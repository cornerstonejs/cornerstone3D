import PlanarViewport from '../../src/RenderingEngine/Viewports/Planar/PlanarViewport';
import renderingEngineCache from '../../src/RenderingEngine/renderingEngineCache';
import uuidv4 from '../../src/utilities/uuidv4';

/**
 * Makes a direct planar viewport on a stand-in rendering engine. A real
 * rendering engine needs WebGL for a planar viewport, which jsdom lacks; the
 * CPU render paths draw without it. `destroy` of the stand-in engine destroys
 * the viewport.
 */
export function createPlanarViewportOnStandInEngine(
  element,
  viewportId,
  { canvas = document.createElement('canvas'), defaultOptions = {} } = {}
) {
  const renderer = {
    getActiveCamera: () => ({ setParallelProjection() {} }),
    computeVisiblePropBounds: () => [1, -1, 1, -1, 1, -1],
    getViewProps: () => [],
  };
  let viewport;
  const renderingEngine = {
    id: uuidv4(),
    getRenderer: () => renderer,
    getViewports: () => (viewport ? [viewport] : []),
    renderViewport() {},
    destroy() {
      viewport.destroy();
      renderingEngineCache.delete(renderingEngine.id);
    },
  };

  renderingEngineCache.set(renderingEngine);
  viewport = new PlanarViewport({
    id: viewportId,
    element,
    renderingEngineId: renderingEngine.id,
    canvas,
    sWidth: element.clientWidth,
    sHeight: element.clientHeight,
    defaultOptions,
  });

  return { renderingEngine, viewport };
}
