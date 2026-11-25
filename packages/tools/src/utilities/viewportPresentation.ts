import { type Types, viewportProjection } from '@cornerstonejs/core';

type ViewPresentationViewport = {
  getViewPresentation?(selector?: Types.ViewPresentationSelector): unknown;
  setViewPresentation?(presentation?: unknown): void;
  setViewState?(viewState: unknown): void;
};

/**
 * Reads a viewport-family presentation through projection when available, with
 * a legacy viewport fallback for non-Next viewports.
 */
export function getViewportPresentation(
  viewport: unknown,
  selector?: Types.ViewPresentationSelector
): unknown {
  const projectionPresentation = viewportProjection.getPresentation(viewport, {
    selector,
  });

  if (projectionPresentation) {
    return projectionPresentation;
  }

  return (viewport as ViewPresentationViewport).getViewPresentation?.(selector);
}

/**
 * Applies a presentation object to a viewport without making the projection
 * registry mutate viewport state.
 */
export function applyViewportPresentation(
  viewport: unknown,
  presentation: unknown
): boolean {
  if (!presentation) {
    return false;
  }

  const target = viewport as ViewPresentationViewport;
  const nextViewState = viewportProjection.withPresentation(
    viewport,
    presentation
  );

  if (nextViewState && typeof target.setViewState === 'function') {
    target.setViewState(nextViewState);
    return true;
  }

  if (typeof target.setViewPresentation === 'function') {
    target.setViewPresentation(presentation);
    return true;
  }

  return false;
}
