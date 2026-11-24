import type { PlanarViewport } from '@cornerstonejs/core';
import { Enums, RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<PlanarViewport>('CT');

const Events = { VOI_MODIFIED: 'app:voi' };

export function listen(element: HTMLDivElement) {
  element.addEventListener(Events.VOI_MODIFIED, (evt: CustomEvent) => {
    console.log(evt.detail.range);
  });
  element.addEventListener(
    Enums.Events.DISPLAY_SET_APPEARANCE_CHANGED,
    (evt: CustomEvent) => {
      console.log(evt.detail.effective.voiRange);
    }
  );
}

export function store(displaySetId: string) {
  const overrides = viewport.getDisplaySetAppearance(displaySetId);

  return JSON.stringify(overrides);
}

export function shown(displaySetId: string) {
  const effective = viewport.getEffectiveDisplaySetAppearance(displaySetId);

  return effective?.invert === true;
}
