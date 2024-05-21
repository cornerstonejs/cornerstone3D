import getRenderingEngine, {
  getRenderingEngines,
} from './RenderingEngine/getRenderingEngine';
import { IEnabledElement, IStackViewport, IVolumeViewport } from './types';

/**
 * A convenience method to find an EnabledElement given a reference to its
 * associated element. Commonly used in code that's handling a custom
 * event emitted by this library.
 *
 * @example
 * Using the renderingEngine to find the enabled element:
 * ```javascript
 * const element = getRenderingEngine(renderingEngineId)
 *    .getViewport(viewportId)
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
  element: HTMLDivElement | undefined
): IEnabledElement | undefined {
  if (!element) {
    return;
  }

  const { viewportUid, renderingEngineUid } = element.dataset;

  return getEnabledElementByIds(viewportUid, renderingEngineUid);
}

/**
 * Similar to {@link getEnabledElement}, but takes the IDs of the
 * renderingEngine and viewport as parameters to return the associated
 * EnabledElement.
 *
 * @param viewportId - The Id of the viewport
 * @param renderingEngineId - The Id of the rendering engine.
 * @returns The enabled element which is an object that contains the viewport, rendering
 * engine, viewport Id, rendering engine Id, and the Frame of Reference UID.
 */
export function getEnabledElementByIds(
  viewportId: string,
  renderingEngineId: string
): IEnabledElement {
  if (!renderingEngineId || !viewportId) {
    return;
  }

  const renderingEngine = getRenderingEngine(renderingEngineId);

  if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
    return;
  }

  const viewport = renderingEngine.getViewport(viewportId) as
    | IStackViewport
    | IVolumeViewport;

  if (!viewport) {
    return;
  }

  const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

  return {
    viewport,
    renderingEngine,
    viewportId,
    renderingEngineId,
    FrameOfReferenceUID,
  };
}

/**
 * Retrieves the enabled element by the specified viewport ID. it searches
 * through all the rendering engines to find the viewport with the specified
 *
 * @param viewportId - The ID of the viewport.
 * @returns The enabled element associated with the specified viewport ID.
 */
export function getEnabledElementByViewportId(viewportId: string) {
  const renderingEngines = getRenderingEngines();

  for (let i = 0; i < renderingEngines.length; i++) {
    const renderingEngine = renderingEngines[i];
    const viewport = renderingEngine.getViewport(viewportId);

    if (viewport) {
      return getEnabledElementByIds(viewportId, renderingEngine.id);
    }
  }
}

/**
 * Get all the enabled elements from all the rendering engines
 * @returns An array of enabled elements.
 */
export function getEnabledElements(): IEnabledElement[] {
  const enabledElements = [];

  const renderingEngines = getRenderingEngines();

  renderingEngines.forEach((renderingEngine) => {
    const viewports = renderingEngine.getViewports();

    viewports.forEach(({ element }) => {
      enabledElements.push(getEnabledElement(element));
    });
  });

  return enabledElements;
}
