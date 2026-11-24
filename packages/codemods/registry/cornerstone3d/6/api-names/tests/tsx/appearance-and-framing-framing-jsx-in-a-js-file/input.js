import React from 'react';
import { viewportProjection } from '@cornerstonejs/core';
import { synchronizers } from '@cornerstonejs/tools';

const sync = synchronizers.createPresentationViewSynchronizer('zoom-pan', {
  zoom: true,
  pan: true,
});

export function ZoomLabel({ viewport }) {
  const framing = viewportProjection.getPresentation(viewport, {
    selector: { zoom: true },
  });
  const reset = () =>
    viewport.setViewState(
      viewportProjection.withPresentation(viewport, { zoom: 1 })
    );

  return (
    <button onClick={reset} data-sync={sync.id}>
      {framing?.zoom}
    </button>
  );
}
