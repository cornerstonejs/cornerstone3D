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
  typed.setDisplayArea(area);
  fixed.setDisplayArea(area, true);
  fixed.setDisplayArea(...areas);
  fixed['getDisplayArea']();
  fixed?.setDisplayArea({ imageArea: [1, 1] });

  const read = fixed?.getDisplayArea()?.imageArea;
  const { getDisplayArea, options } = fixed;

  viewport = fixed;
  typed.element.addEventListener(EVENTS.DISPLAY_AREA_MODIFIED, () => read);
  typed.element.addEventListener('CORNERSTONE_DISPLAY_AREA_MODIFIED', () => read);

  return [getDisplayArea, options];
}
