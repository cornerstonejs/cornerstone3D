import getRenderingEngine from './RenderingEngine/getRenderingEngine'
import { IEnabledElement } from './types'

/**
 * A convenience method to find an EnabledElement given a reference to its
 * associated element. Commonly used in code that's handling a custom
 * event emitted by this library.
 *
 * @example
 * Using the renderingEngine to find the enabled element:
 * ```javascript
 * const element = getRenderingEngine(renderingEngineUID)
 *    .getViewport(viewportUID)
 *    .element
 *
 * const enabledElement = getEnabledElement(element)
 * ```
 *
 * @example
 * Using a cornerstone event's "element"
 * ```javascript
 * // Our "cornerstone events" contain the source element, which is
 * // raised on the viewport's div element
 * const { element } = evt.detail
 * const enabledElement = getEnabledElement(element)
 * ```
 *
 * @param element - a reference to an EnabledElement/Viewport's div element
 * @returns the associated EnabledElement, or undefined if no matching EnabledElement
 * can be found
 */
export default function getEnabledElement(
  element: HTMLElement | undefined
): IEnabledElement | undefined {
  if (!element) {
    return
  }

  const { viewportUid, renderingEngineUid } = element.dataset

  return getEnabledElementByUIDs(viewportUid, renderingEngineUid)
}

/**
 * Similar to {@link getEnabledElement}, but takes the UIDs of the
 * renderingEngine and viewport as parameters to return the associated
 * EnabledElement.
 *
 * @param viewportUID - The UID of the viewport
 * @param renderingEngineUID - The UID of the rendering engine.
 * @returns The enabled element which is an object that contains the viewport, rendering
 * engine, viewport UID, rendering engine UID, and the Frame of Reference UID.
 */
export function getEnabledElementByUIDs(
  viewportUID: string,
  renderingEngineUID: string
): IEnabledElement {
  if (!renderingEngineUID || !viewportUID) {
    return
  }

  const renderingEngine = getRenderingEngine(renderingEngineUID)

  if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
    return
  }

  const viewport = renderingEngine.getViewport(viewportUID)

  if (!viewport) {
    return
  }

  const FrameOfReferenceUID = viewport.getFrameOfReferenceUID()

  return {
    viewport,
    renderingEngine,
    viewportUID,
    renderingEngineUID,
    FrameOfReferenceUID,
  }
}
