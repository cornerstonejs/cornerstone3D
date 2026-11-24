import type {
  PlanarViewFraming,
  PlanarViewFramingSelector as Selector,
  ProjectionFraming,
  ProjectionSnapshot,
  Types,
  Volume3DProjectionFraming,
  ViewportProjectionAdapter,
} from '@cornerstonejs/core';
import { utilities, viewportProjection } from '@cornerstonejs/core';
import * as cs from '@cornerstonejs/core';
import { synchronizers } from '@cornerstonejs/tools';
import {
  applyViewportFraming as applyViewportPresentation,
  getViewportFraming as getViewportPresentation,
} from '@cornerstonejs/tools/utilities/viewportFraming';

export type { ProjectionFramingForKind as ProjectionPresentationForKind } from '@cornerstonejs/core';

const selector: Selector = { zoom: true, pan: true, scale: true };
const sync = synchronizers.createViewFramingSynchronizer('framing', {
  zoom: true,
});
const { createViewFramingSynchronizer } = synchronizers;

export function copy(
  source: Types.IViewport,
  target: Types.IViewport,
  canvas: HTMLCanvasElement,
  snapshot: ProjectionSnapshot
) {
  const framing = viewportProjection.getFraming(source, {
    selector,
  }) as PlanarViewFraming;
  const all: Types.ViewFraming = cs.viewportProjection.getFraming(source);
  const viewState = viewportProjection.withFraming(target, framing);
  const zoom = viewportProjection.get(source)?.framing.zoom;
  const current = viewportProjection.get(target);
  const { framing: presentation } = current;
  const rotation = current.framing.rotation;
  const pick: Types.ViewFramingSelector = { rotation: true };
  const threeD: Volume3DProjectionFraming = { zoom: 2 };
  const base: ProjectionFraming = snapshot.framing;

  utilities.loadImageToCanvas({ canvas, imageId: 'x', viewFraming: all });
  applyViewportPresentation(target, getViewportPresentation(source, pick));
  target.setViewState(viewState);

  return [zoom, presentation, rotation, threeD, base, sync, createViewFramingSynchronizer];
}

const adapter: ViewportProjectionAdapter = {
  id: 'custom',
  viewportTypes: ['custom'],
  getSnapshot: () => undefined,
  getFraming: (snapshot) => snapshot.presentation,
  withFraming: (snapshot, framing) => ({ ...snapshot.viewState, ...framing }),
};

viewportProjection.register({
  ...adapter,
  getFraming(snapshot) {
    return snapshot.presentation;
  },
});
