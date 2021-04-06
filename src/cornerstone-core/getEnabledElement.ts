import getRenderingEngine from './RenderingEngine/getRenderingEngine'
import { IEnabledElement } from './types'

/**
 * A convenience method to find an EnabledElement given a reference to its
 * associated canvas element. Commonly used in code that's handeling a custom
 * event emitted by this library.
 *
 * @example
 * Using the renderingEngine to find the enabled element:
 * ```
 * const canvas = getRenderingEngine(renderingEngineUID)
 *    .getScene(sceneUID)
 *    .getViewport(viewportUID)
 *    .getCanvas()
 *
 * const enabledElement = getEnabledElement(canvas)
 * ```
 *
 * @example
 * Using a cornerstone event's "element"
 * ```
 * // Our "cornerstone events" contain the source element, which is
 * // raised on the viewport's canvas element
 * const { element: canvas } = evt.detail
 * const enabledElement = getEnabledElement(canvas)
 * ```
 *
 * @param canvas a reference to an EnabledElement/Viewport's canvas element
 * @returns the associated EnabledElement, or undefined if no matching EnabledElement
 * can be found
 */
export default function getEnabledElement(
  canvas: HTMLElement | undefined
): IEnabledElement | undefined {
  if (!canvas) {
    return
  }

  const {
    viewportUid: viewportUID,
    sceneUid: sceneUID,
    renderingEngineUid: renderingEngineUID,
  } = canvas.dataset

  if (!renderingEngineUID || !sceneUID || !viewportUID) {
    return
  }

  const renderingEngine = getRenderingEngine(renderingEngineUID)

  if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
    return
  }

  const scene = renderingEngine.getScene(sceneUID)
  const viewport = scene.getViewport(viewportUID)
  const FrameOfReferenceUID =
    (scene.getFrameOfReferenceUID && scene.getFrameOfReferenceUID()) ||
    undefined

  return {
    viewport,
    scene,
    renderingEngine,
    viewportUID,
    sceneUID,
    renderingEngineUID,
    FrameOfReferenceUID,
  }
}
