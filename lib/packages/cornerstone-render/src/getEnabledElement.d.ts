import { IEnabledElement } from './types';
/**
 * A convenience method to find an EnabledElement given a reference to its
 * associated canvas element. Commonly used in code that's handling a custom
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
export default function getEnabledElement(canvas: HTMLElement | undefined): IEnabledElement | undefined;
