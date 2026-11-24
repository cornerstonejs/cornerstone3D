import React from 'react';
import { Enums, BaseViewport, utilities } from '@cornerstonejs/core';

export function ViewportLabel({ viewport }) {
  const volumeId = utilities.resolveViewportVolumeId(viewport);

  return (
    <span data-type={Enums.ViewportType.PLANAR}>
      {utilities.isGenericViewport(viewport) ? volumeId : 'legacy'}
      {viewport instanceof BaseViewport ? 'base' : 'other'}
    </span>
  );
}
