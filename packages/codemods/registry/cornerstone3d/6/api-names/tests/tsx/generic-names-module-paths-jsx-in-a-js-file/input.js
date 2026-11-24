import React from 'react';
import { resolveGenericViewportVolumeId } from '@cornerstonejs/core/utilities/resolveGenericViewportVolumeId';
import { getViewSlabDepthOfViewport } from '@cornerstonejs/tools/utilities/genericViewportToolHelpers';

export function SlabLabel({ viewport }) {
  return (
    <span title={resolveGenericViewportVolumeId(viewport)}>
      {getViewSlabDepthOfViewport(viewport)}
    </span>
  );
}
