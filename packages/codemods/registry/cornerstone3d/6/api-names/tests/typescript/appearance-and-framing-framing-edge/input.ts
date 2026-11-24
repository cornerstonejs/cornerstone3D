import type { ViewPresentation, ViewPresentationSelector } from '@cornerstonejs/core/types';
import type { PlanarViewFraming } from './framing';
import {
  planarProjection,
  viewportProjection as projection,
  volume3DProjection,
} from '@cornerstonejs/core';
import type { PlanarResolvedICamera } from '@cornerstonejs/core';
import type { PlanarViewPresentation } from '@cornerstonejs/core';
import * as viewportFraming from '@cornerstonejs/tools/utilities/viewportPresentation.js';

export { getViewportPresentation as readFraming } from '@cornerstonejs/tools/utilities/viewportPresentation';
export type { PlanarViewPresentation };

export function edges(viewport: unknown, framing: PlanarViewFraming, selector: ViewPresentationSelector) {
  let snapshot = projection.get(viewport);
  const read = projection['getPresentation'](viewport, { selector });
  const { withPresentation } = projection;
  const local: ViewPresentation = read;
  const other: PlanarViewPresentation = { zoom: 1 };

  snapshot = projection.get(viewport);

  return [
    snapshot.presentation,
    withPresentation(viewport, framing),
    viewportFraming.getViewportPresentation(viewport),
    local,
    other,
  ];
}

export function namespaces(viewport: unknown, camera: PlanarResolvedICamera) {
  const snapshot = planarProjection.getSnapshot({ viewport });
  const framing = planarProjection.adapter.getPresentation(snapshot);
  const next = volume3DProjection.adapter.withPresentation(
    volume3DProjection.getSnapshot({ viewport }),
    { zoom: 2 }
  );

  return [
    framing,
    next,
    snapshot.presentation.zoom,
    planarProjection.derivePresentation,
    camera.presentationScale,
  ];
}
