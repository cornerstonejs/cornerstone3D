import type { PlanarViewport, Types } from '@cornerstonejs/core';
import { Enums, RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<PlanarViewport>('CT');

class Readout {
  onVOI = (evt: Types.EventTypes.DisplaySetAppearanceChangedEvent) => {
    return evt.detail.range;
  };

  listen(element: HTMLDivElement) {
    element.addEventListener(Enums.Events.DISPLAY_SET_APPEARANCE_CHANGED, this.onVOI);
  }
}

function forward(detail: unknown) {
  return detail;
}

export function listen(element: HTMLDivElement) {
  element.addEventListener(Enums.Events.DISPLAY_SET_APPEARANCE_CHANGED, ({ detail }) => {
    forward(detail);
  });
  element.addEventListener(Enums.Events.DISPLAY_SET_APPEARANCE_CHANGED, (evt) => {
    forward(evt.detail);

    if (evt.detail.invertStateChanged) {
      forward(evt.detail.effective.invert);
    }
  });
  element.removeEventListener('CORNERSTONE_COLORMAP_MODIFIED', forward);

  return new Readout();
}

export function toggle(displaySetId: string) {
  const { invert } = viewport.getDisplaySetAppearance(displaySetId) ?? {};

  viewport.setDisplaySetAppearance(displaySetId, { invert: !invert });
}
