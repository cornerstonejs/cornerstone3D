import { getRenderingEngine } from '../RenderingEngine';

export default function getEnabledElement(canvas) {
  const viewportUID = canvas.getAttribute('data-viewport-uid');
  const sceneUID = canvas.getAttribute('data-scene-uid');
  const renderingEngineUID = canvas.getAttribute('data-rendering-engine-uid');

  const renderingEngine = getRenderingEngine(renderingEngineUID);
  const scene = renderingEngine.getScene(sceneUID);
  const viewport = scene.getViewport(viewportUID);

  return {
    viewport,
    scene,
    viewportUID,
    sceneUID,
    renderingEngineUID,
  };
}
