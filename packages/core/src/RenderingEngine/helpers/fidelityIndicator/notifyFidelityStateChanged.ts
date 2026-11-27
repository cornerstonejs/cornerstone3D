import Events from '../../../enums/Events';
import type { Point3 } from '../../../types';
import type { ViewportFidelityChangedEventDetail } from '../../../types/EventTypes';
import triggerEvent from '../../../utilities/triggerEvent';
import {
  buildViewportFidelityState,
  viewportFidelityStateKey,
} from './buildViewportFidelityState';
import type { FidelityLine } from './fidelityIndicatorState';

/** The parts of a viewport that the fidelity event needs. */
export type FidelityEventSource = {
  id: string;
  renderingEngineId: string;
  element: HTMLDivElement;
  suppressEvents?: boolean;
};

const lastKeys = new WeakMap<object, string>();

/**
 * Builds the fidelity state from `lines` and fires `VIEWPORT_FIDELITY_CHANGED`
 * on the viewport element when the change key differs from the last one
 * (FIDELITY-EVENT-2..4). The key holds the derived indicator state and not the
 * display spacing, so a zoom that keeps the verdict fires nothing. A viewport
 * with `suppressEvents` records the key and fires nothing.
 *
 * Called after `IMAGE_RENDERED`: by the rendering engines, and by a generic
 * viewport whose render path draws outside the engine (FIDELITY-EVENT-7).
 *
 * @internal
 */
export function notifyFidelityStateChanged(
  viewport: FidelityEventSource,
  lines: FidelityLine[],
  displaySpacing?: Point3
): void {
  const state = buildViewportFidelityState(lines, displaySpacing);
  const key = viewportFidelityStateKey(state);

  if (lastKeys.get(viewport) === key) {
    return;
  }

  lastKeys.set(viewport, key);

  if (viewport.suppressEvents) {
    return;
  }

  const eventDetail: ViewportFidelityChangedEventDetail = {
    viewportId: viewport.id,
    renderingEngineId: viewport.renderingEngineId,
    state,
  };

  triggerEvent(viewport.element, Events.VIEWPORT_FIDELITY_CHANGED, eventDetail);
}
