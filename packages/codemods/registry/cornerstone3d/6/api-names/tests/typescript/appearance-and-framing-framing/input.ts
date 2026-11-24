import type {
  PlanarViewPresentation,
  PlanarViewPresentationSelector as Selector,
  ProjectionPresentation,
  ProjectionSnapshot,
  Types,
  Volume3DProjectionPresentation,
  ViewportProjectionAdapter,
} from '@cornerstonejs/core';
import { utilities, viewportProjection } from '@cornerstonejs/core';
import * as cs from '@cornerstonejs/core';
import { synchronizers } from '@cornerstonejs/tools';
import {
  applyViewportPresentation,
  getViewportPresentation,
} from '@cornerstonejs/tools/utilities/viewportPresentation';

export type { ProjectionPresentationForKind } from '@cornerstonejs/core';

const selector: Selector = { zoom: true, pan: true, scale: true };
const sync = synchronizers.createPresentationViewSynchronizer('framing', {
  zoom: true,
});
const { createPresentationViewSynchronizer } = synchronizers;

export function copy(
  source: Types.IViewport,
  target: Types.IViewport,
  canvas: HTMLCanvasElement,
  snapshot: ProjectionSnapshot
) {
  const framing = viewportProjection.getPresentation(source, {
    selector,
  }) as PlanarViewPresentation;
  const all: Types.ViewPresentation = cs.viewportProjection.getPresentation(source);
  const viewState = viewportProjection.withPresentation(target, framing);
  const zoom = viewportProjection.get(source)?.presentation.zoom;
  const current = viewportProjection.get(target);
  const { presentation } = current;
  const rotation = current.presentation.rotation;
  const pick: Types.ViewPresentationSelector = { rotation: true };
  const threeD: Volume3DProjectionPresentation = { zoom: 2 };
  const base: ProjectionPresentation = snapshot.presentation;

  utilities.loadImageToCanvas({ canvas, imageId: 'x', viewPresentation: all });
  applyViewportPresentation(target, getViewportPresentation(source, pick));
  target.setViewState(viewState);

  return [zoom, presentation, rotation, threeD, base, sync, createPresentationViewSynchronizer];
}

const adapter: ViewportProjectionAdapter = {
  id: 'custom',
  viewportTypes: ['custom'],
  getSnapshot: () => undefined,
  getPresentation: (snapshot) => snapshot.presentation,
  withPresentation: (snapshot, framing) => ({ ...snapshot.viewState, ...framing }),
};

viewportProjection.register({
  ...adapter,
  getPresentation(snapshot) {
    return snapshot.presentation;
  },
});
