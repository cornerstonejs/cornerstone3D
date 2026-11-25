import type { Types } from '@cornerstonejs/core';
import { getRenderingEngine } from '@cornerstonejs/core';

export function stretch(
  viewport: Types.IViewport,
  saved: Types.ViewFraming,
  computeStretch: () => Types.Point2
) {
  const fixed = getRenderingEngine('engine').getViewport('b');
  const aspectRatio: Types.Point2 = [2, 1];

  fixed.setViewFraming({  });
  fixed.setViewFraming({ ...saved });
  fixed.setViewFraming({ aspectRatio: computeStretch() });
  fixed?.setViewFraming({ zoom: 1 });
  fixed.getViewFraming({  });
  viewport.setViewFraming({  });

  return fixed.getViewFraming()?.zoom;
}
