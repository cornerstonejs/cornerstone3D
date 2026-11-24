import React from 'react';
import { resolveViewportVolumeId as resolveGenericViewportVolumeId } from '@cornerstonejs/core/utilities/resolveViewportVolumeId';
import { getViewSlabDepthOfViewport } from '@cornerstonejs/tools/utilities/viewportToolHelpers';

export function SlabLabel({ viewport }) {
  return (
    <span title={resolveGenericViewportVolumeId(viewport)}>
      {getViewSlabDepthOfViewport(viewport)}
    </span>
  );
}
