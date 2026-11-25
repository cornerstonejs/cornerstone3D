import type { Types } from '@cornerstonejs/core';
import { getRenderingEngine } from '@cornerstonejs/core';

export function stretch(
  viewport: Types.IViewport,
  saved: Types.ViewFraming,
  computeStretch: () => Types.Point2
) {
  const fixed = getRenderingEngine('engine').getViewport('b');
  const aspectRatio: Types.Point2 = [2, 1];

  fixed.setViewFraming({ aspectRatio });
  fixed.setViewFraming({ ...saved, aspectRatio: [1, 1] });
  fixed.setViewFraming({ aspectRatio: computeStretch() });
  fixed?.setViewFraming({ zoom: 1, aspectRatio: [3, 1] });
  fixed.getViewFraming({ aspectRatio: true });
  viewport.setViewFraming({ aspectRatio: [2, 1] });

  return fixed.getViewFraming()?.zoom;
}
