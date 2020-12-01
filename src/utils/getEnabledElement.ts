import { getRenderingEngine } from '../RenderingEngine';

export default function getEnabledElement(canvas) {
  const {
    viewportUid: viewportUID,
    sceneUid: sceneUID,
    renderingEngineUid: renderingEngineUID,
  } = canvas.dataset;
  const renderingEngine = getRenderingEngine(renderingEngineUID);
  const scene = renderingEngine.getScene(sceneUID);
  const viewport = scene.getViewport(viewportUID);
  const FrameOfReferenceUID = viewport.FrameOfReferenceUID;

  return {
    viewport,
    scene,
    viewportUID,
    sceneUID,
    renderingEngineUID,
  };
}
