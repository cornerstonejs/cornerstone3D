import { getRenderingEngine } from '../RenderingEngine';

export default function getEnabledElement(canvas) {
  if (!canvas) {
    return;
  }

  const {
    viewportUid: viewportUID,
    sceneUid: sceneUID,
    renderingEngineUid: renderingEngineUID,
  } = canvas.dataset;

  if (!renderingEngineUID || !sceneUID || !viewportUID) {
    return;
  }

  const renderingEngine = getRenderingEngine(renderingEngineUID);

  if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
    return;
  }

  const scene = renderingEngine.getScene(sceneUID);
  const viewport = scene.getViewport(viewportUID);
  const FrameOfReferenceUID = scene.getFrameOfReferenceUID();

  return {
    viewport,
    scene,
    renderingEngine,
    viewportUID,
    sceneUID,
    renderingEngineUID,
    FrameOfReferenceUID,
  };
}
