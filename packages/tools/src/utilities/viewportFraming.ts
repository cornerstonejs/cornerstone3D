import { type Types, viewportProjection } from '@cornerstonejs/core';

type ViewStateViewport = {
  setViewState?(viewState: unknown): void;
};

/** What a framing patch keeps in place while it is applied. */
type ViewportFramingWriteOptions = {
  /** The canvas point whose world point a zoom keeps under it. */
  anchorCanvas?: Types.Point2;
};

/**
 * The zoom and the pan of a next viewport in the common form of the
 * projection service.
 */
export type ViewportZoomPan = {
  /** 1 for the fit of the viewport. */
  zoom: number;
  /** The shift of the picture in canvas pixels at zoom 1. */
  pan: Types.Point2;
  /**
   * The scale of each canvas axis: the zoom for both, or the two scales of
   * a planar view that is stretched. The picture is `pan * scale` canvas
   * pixels from its fitted place.
   */
  scale: Types.Point2;
};

const zoomPanSelector = {
  zoom: true,
  pan: true,
  scale: true,
} as Types.ViewFramingSelector;

/**
 * Reads the framing of a viewport of any family through the projection
 * service.
 */
export function getViewportFraming(
  viewport: unknown,
  selector?: Types.ViewFramingSelector
): unknown {
  return viewportProjection.getFraming(viewport, { selector });
}

/**
 * Applies a framing object to a viewport without making the projection
 * registry mutate viewport state.
 *
 * @param options - For a next viewport: the canvas point that a zoom keeps.
 */
export function applyViewportFraming(
  viewport: unknown,
  framing: unknown,
  options?: ViewportFramingWriteOptions
): boolean {
  if (!framing) {
    return false;
  }

  const target = viewport as ViewStateViewport;
  const nextViewState = viewportProjection.withFraming(
    viewport,
    framing,
    undefined,
    options
  );

  if (nextViewState && typeof target.setViewState === 'function') {
    target.setViewState(nextViewState);
    return true;
  }

  return false;
}

/**
 * The zoom and the pan of a next viewport of any family, from the projection
 * service. Undefined for a viewport that the projection service does not
 * know, and for one that has no zoom, as a 3D viewport that shows nothing.
 */
export function getViewportZoomPan(
  viewport: unknown
): ViewportZoomPan | undefined {
  const framing = viewportProjection.getFraming<{
    zoom?: number;
    pan?: Types.Point2;
    scale?: unknown;
  }>(viewport, { selector: zoomPanSelector });

  if (typeof framing?.zoom !== 'number' || !framing.pan) {
    return;
  }

  const { zoom, pan, scale } = framing;

  return {
    zoom,
    pan: [pan[0], pan[1]],
    scale: Array.isArray(scale) ? [scale[0], scale[1]] : [zoom, zoom],
  };
}

/**
 * Moves the picture of a next viewport of any family by a delta in canvas
 * pixels on the screen, through the projection service.
 *
 * @returns False when the viewport has no zoom and pan there.
 */
export function panViewportByCanvasDelta(
  viewport: unknown,
  delta: Types.Point2
): boolean {
  const zoomPan = getViewportZoomPan(viewport);

  if (!zoomPan) {
    return false;
  }

  const { pan, scale } = zoomPan;

  return applyViewportFraming(viewport, {
    pan: [pan[0] + delta[0] / scale[0], pan[1] + delta[1] / scale[1]],
  });
}

/**
 * Sets the zoom of a next viewport of any family through the projection
 * service, as one change of the view state. With a canvas point, the
 * projection keeps the world point under it under it.
 *
 * @returns False when the viewport has no zoom and pan there.
 */
export function zoomViewportAtCanvasPoint(
  viewport: Types.IViewport,
  zoom: number,
  canvasPoint?: Types.Point2
): boolean {
  if (!getViewportZoomPan(viewport)) {
    return false;
  }

  return applyViewportFraming(
    viewport,
    { zoom },
    { anchorCanvas: canvasPoint }
  );
}
