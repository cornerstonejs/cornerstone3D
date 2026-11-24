import type { Types } from '@cornerstonejs/core';
import { EVENTS, getRenderingEngine } from '@cornerstonejs/core';

export function frame(
  typed: Types.IViewport,
  areas: Types.DisplayArea[],
  area: Types.DisplayArea
) {
  let viewport = getRenderingEngine('engine').getViewport('a');
  const fixed = getRenderingEngine('engine').getViewport('b');

  viewport.setDisplayArea(area);
  typed.setViewState({ displayArea: area });
  fixed.setDisplayArea(area, true);
  fixed.setDisplayArea(...areas);
  fixed['getDisplayArea']();
  fixed?.setViewState({ displayArea: { imageArea: [1, 1] } });

  const read = fixed?.getViewState().displayArea?.imageArea;
  const { getDisplayArea, options } = fixed;

  viewport = fixed;
  typed.element.addEventListener(EVENTS.DISPLAY_AREA_MODIFIED, () => read);
  typed.element.addEventListener('CORNERSTONE_DISPLAY_AREA_MODIFIED', () => read);

  return [getDisplayArea, options];
}
