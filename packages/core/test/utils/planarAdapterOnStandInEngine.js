import PlanarViewportLegacyAdapter from '../../src/RenderingEngine/GenericViewport/Planar/PlanarViewportLegacyAdapter';
import renderingEngineCache from '../../src/RenderingEngine/renderingEngineCache';
import uuidv4 from '../../src/utilities/uuidv4';

/**
 * Makes the viewport that a legacy `STACK` type gives, the planar legacy
 * adapter, on a stand-in rendering engine. A real rendering engine needs
 * WebGL for a planar viewport, which jsdom lacks; the CPU render paths draw
 * without it. `destroy` of the stand-in engine destroys the viewport.
 */
export function createPlanarAdapterOnStandInEngine(
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
  viewport = new PlanarViewportLegacyAdapter({
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
