import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

/**
 * Returns the displayed canvas size for a viewport, in the same coordinate
 * space that `viewport.worldToCanvas` returns points in.
 *
 * Native ("generic") viewports render to a separate visible canvas; their
 * `viewport.canvas` is a hidden cornerstone-canvas whose client size is 0,
 * which would collapse geometry computed from it. worldToCanvas already
 * returns coordinates in the element's displayed space for those viewports,
 * so the element size is used instead.
 */
export default function getDisplayedCanvasSize(viewport: Types.IViewport): {
  clientWidth: number;
  clientHeight: number;
} {
  if (csUtils.isGenericViewport(viewport)) {
    const { element } = viewport;
    return {
      clientWidth: element?.clientWidth ?? 0,
      clientHeight: element?.clientHeight ?? 0,
    };
  }

  const { clientWidth = 0, clientHeight = 0 } = viewport.canvas ?? {};
  return { clientWidth, clientHeight };
}
