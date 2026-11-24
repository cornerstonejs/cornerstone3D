import React from 'react';
import { Enums, GenericViewport, utilities } from '@cornerstonejs/core';

export function ViewportLabel({ viewport }) {
  const volumeId = utilities.resolveGenericViewportVolumeId(viewport);

  return (
    <span data-type={Enums.ViewportType.PLANAR_NEXT}>
      {utilities.isGenericViewport(viewport) ? volumeId : 'legacy'}
      {viewport instanceof GenericViewport ? 'base' : 'other'}
    </span>
  );
}
