import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, getEnabledElement } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport('CT');

function copyView(target: Types.IStackViewport, element: HTMLDivElement) {
  const presentation = viewport.getViewFraming({ zoom: true, pan: true });

  target.setViewFraming(presentation);
  getEnabledElement(element).viewport.setViewFraming({ rotation: 90 });

  return viewport.getViewFraming();
}

type LegacyViewport = {
  setViewPresentation?(presentation: object): void;
};

function copyToOwnType(target: Types.IViewport) {
  const legacy = target as unknown as LegacyViewport;

  legacy.setViewPresentation?.({ zoom: 2 });
}

function copyByName(sourceViewport, history: { getViewPresentation(): object }) {
  sourceViewport.setViewPresentation(history.getViewPresentation());
}

console.log(copyView, copyByName, copyToOwnType);
