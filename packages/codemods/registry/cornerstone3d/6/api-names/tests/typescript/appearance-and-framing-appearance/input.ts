import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  getEnabledElement,
  utilities,
  utilities as csUtils,
} from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<PlanarViewport>('CT');
const { viewportSupportsDisplaySetPresentation } = utilities;

type AppViewport = Types.IViewport & {
  setDisplaySetPresentation?: (displaySetId: string, props: object) => void;
  getDisplaySetPresentation?: (displaySetId: string) => object;
};

export async function show(
  displaySetId: string,
  element: HTMLDivElement,
  target: Types.IViewport,
  appViewport: AppViewport
) {
  await viewport.setDisplaySets(
    { displaySetId },
    { displaySetId: 'pt', options: { role: 'overlay', presentation: { opacity: 0.5 } } }
  );
  await viewport.addDisplaySet('seg', { presentation: { visible: true } });

  viewport.setDisplaySetPresentation(displaySetId, { invert: true });
  viewport.setDisplaySetPresentation({ voiRange: { lower: 0, upper: 100 } });

  const look = viewport.getDisplaySetPresentation(displaySetId);
  const { viewport: enabled } = getEnabledElement(element);

  enabled.resetDisplaySetPresentation(displaySetId);
  target.setDisplaySetPresentation(displaySetId, look);

  if (utilities.viewportSupportsDisplaySetPresentation(target)) {
    target.getDisplaySetPresentation(displaySetId);
  }

  appViewport.setDisplaySetPresentation?.(displaySetId, {});

  return [
    csUtils.viewportSupportsDisplaySetPresentation(enabled),
    viewportSupportsDisplaySetPresentation(viewport),
  ];
}

export function byName(viewport2, displaySetId: string) {
  viewport2.setDisplaySetPresentation(displaySetId, { invert: false });

  return viewport2.getDisplaySetPresentation(displaySetId);
}

export async function mountWithAppearance(displaySetId: string) {
  await viewport.setDisplaySets({ displaySetId, options: { appearance: { invert: true } } });
  await viewport.addDisplaySet('seg', { appearance: { visible: true } });
}
