import type { PlanarViewport } from '@cornerstonejs/core';
import { Enums, RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<PlanarViewport>('fusion');
const sharedColormap = { name: 'hsv', opacity: 0.5 };

export function show(
  ptId: string,
  sliderValue: string,
  colormapFromMenu: { name: string },
  element: HTMLDivElement,
  opacity: number
) {
  viewport.setDisplaySetAppearance(ptId, {
    opacity: 0.8,
    colormap: { name: 'hsv', opacity: 0.5 },
  });
  viewport.setDisplaySetAppearance(ptId, {
    colormap: { name: 'hsv', opacity: Number(sliderValue) },
  });
  viewport.setDisplaySetAppearance(ptId, {
    colormap: {
      opacity: [{ value: 0, opacity: 0 }],
      opacityMapping: [{ value: 1, opacity: 1 }],
    },
  });
  viewport.setDisplaySetAppearance(ptId, { colormap: sharedColormap });
  viewport.setDisplaySetAppearance(ptId, { colormap: { name: 'hsv', opacity } });
  viewport.setDisplaySetAppearance(ptId, { colormap: { ...colormapFromMenu, opacity: 0.4 } });

  const hangingProtocolOptions = {
    colormap: { name: 'hsv', opacity: [{ value: 0, opacity: 0 }] },
  };

  element.addEventListener(Enums.Events.DISPLAY_SET_APPEARANCE_CHANGED, (event) => {
    const { colormap } = (event as CustomEvent).detail.effective;

    console.log(colormap.opacity, event.detail.effective.colormap.opacity);
  });

  return [hangingProtocolOptions, viewport.getDisplaySetAppearance(ptId).colormap?.opacity];
}

export function updateColormap(
  ptId: string,
  patch: { name?: string; opacity?: number },
  store: { setPresentation(props: object): void },
  opacityMapping?: object[]
) {
  const currentColormap = viewport.getDisplaySetAppearance(ptId)?.colormap ?? {};

  viewport.setDisplaySetAppearance(ptId, {
    colormap: { ...currentColormap, ...patch },
  });

  const colormap = opacityMapping
    ? { ...currentColormap, opacityMapping, opacity: patch.opacity }
    : { ...currentColormap, opacity: patch.opacity };

  store.setPresentation({ colormap });
}

export function byName(viewport2, ptId: string) {
  viewport2.setDisplaySetAppearance(ptId, { colormap: { opacity: 0.5 } });
}
