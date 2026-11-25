import type { Types } from '@cornerstonejs/core';

function volumeIdsOf(viewport: Types.IViewport) {
  if (!viewport?.getAllVolumeIds) {
    return [];
  }

  return viewport.getVolumeIds({ includeSegmentations: true });
}

function hasProperties(viewport: Types.IViewport) {
  return typeof viewport.getProperties === 'function';
}

function scrollSpeedOf(viewport) {
  const read = viewport.getCamera;

  return read ? viewport.setZoom(1, true) : undefined;
}

export { volumeIdsOf, hasProperties, scrollSpeedOf };
