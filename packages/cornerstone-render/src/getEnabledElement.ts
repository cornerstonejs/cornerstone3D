import getRenderingEngine from './RenderingEngine/getRenderingEngine'
import { IEnabledElement } from './types'

/**
 * A convenience method to find an EnabledElement given a reference to its
 * associated element. Commonly used in code that's handling a custom
 * event emitted by this library.
 *
 * @example
 * Using the renderingEngine to find the enabled element:
 * ```
 * const element = getRenderingEngine(renderingEngineUID)
 *    .getScene(sceneUID)
 *    .getViewport(viewportUID)
 *    .element
 *
 * const enabledElement = getEnabledElement(element)
 * ```
 *
 * @example
 * Using a cornerstone event's "element"
 * ```
 * // Our "cornerstone events" contain the source element, which is
 * // raised on the viewport's div element
 * const { element } = evt.detail
 * const enabledElement = getEnabledElement(element)
 * ```
 *
 * @param element a reference to an EnabledElement/Viewport's div element
 * @returns the associated EnabledElement, or undefined if no matching EnabledElement
 * can be found
 */
export default function getEnabledElement(
  element: HTMLElement | undefined
): IEnabledElement | undefined {
  if (!element) {
    return
  }

  const {
    viewportUid: viewportUID,
    sceneUid: sceneUID,
    renderingEngineUid: renderingEngineUID,
  } = element.dataset

  if (!renderingEngineUID || !viewportUID) {
    return
  }

  const renderingEngine = getRenderingEngine(renderingEngineUID)

  if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
    return
  }

  const scene = renderingEngine.getScene(sceneUID)
  const viewport = renderingEngine.getViewport(viewportUID)

  if (!scene || !viewport) {
    return
  }

  const FrameOfReferenceUID = viewport.getFrameOfReferenceUID()

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
