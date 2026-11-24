import type { ViewPresentation, ViewPresentationSelector } from '@cornerstonejs/core/types';
import type { PlanarViewFraming } from './framing';
import {
  planarProjection,
  viewportProjection as projection,
  volume3DProjection,
} from '@cornerstonejs/core';
import type { PlanarResolvedICamera } from '@cornerstonejs/core';
import type {
  PlanarViewFraming as PlanarViewPresentation,
} from '@cornerstonejs/core';
import * as viewportFraming from '@cornerstonejs/tools/utilities/viewportFraming.js';

export { getViewportFraming as readFraming } from '@cornerstonejs/tools/utilities/viewportFraming';
export type { PlanarViewPresentation };

export function edges(viewport: unknown, framing: PlanarViewFraming, selector: ViewPresentationSelector) {
  let snapshot = projection.get(viewport);
  const read = projection['getFraming'](viewport, { selector });
  const { withFraming } = projection;
  const local: ViewPresentation = read;
  const other: PlanarViewPresentation = { zoom: 1 };

  snapshot = projection.get(viewport);

  return [
    snapshot.framing,
    withFraming(viewport, framing),
    viewportFraming.getViewportPresentation(viewport),
    local,
    other,
  ];
}

export function namespaces(viewport: unknown, camera: PlanarResolvedICamera) {
  const snapshot = planarProjection.getSnapshot({ viewport });
  const framing = planarProjection.adapter.getFraming(snapshot);
  const next = volume3DProjection.adapter.withFraming(
    volume3DProjection.getSnapshot({ viewport }),
    { zoom: 2 }
  );

  return [
    framing,
    next,
    snapshot.framing.zoom,
    planarProjection.deriveFraming,
    camera.framingScale,
  ];
}
