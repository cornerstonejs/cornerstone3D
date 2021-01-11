import { getRenderingEngine } from '../RenderingEngine';

interface IEnabledElement {
  viewport: any;
  scene: any;
  renderingEngine: any;
  viewportUID: string;
  sceneUID: string;
  renderingEngineUID: string;
  FrameOfReferenceUID: string;
}

/**
 * Returns the average of two numbers.
 *
 * @remarks
 * This method is part of the {@link core-library#Statistics | Statistics subsystem}.
 *
 * @param canvas - The first input number
 * @returns The arithmetic mean of `x` and `y`
 *
 * @beta
 */
export default function getEnabledElement(
  canvas: HTMLElement | undefined
): IEnabledElement {
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
