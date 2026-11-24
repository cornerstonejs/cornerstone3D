import React from 'react';
import { viewportProjection } from '@cornerstonejs/core';
import { synchronizers } from '@cornerstonejs/tools';

const sync = synchronizers.createViewFramingSynchronizer('zoom-pan', {
  zoom: true,
  pan: true,
});

export function ZoomLabel({ viewport }) {
  const framing = viewportProjection.getFraming(viewport, {
    selector: { zoom: true },
  });
  const reset = () =>
    viewport.setViewState(
      viewportProjection.withFraming(viewport, { zoom: 1 })
    );

  return (
    <button onClick={reset} data-sync={sync.id}>
      {framing?.zoom}
    </button>
  );
}
