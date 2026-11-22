import React from 'react';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { utilities as toolsUtilities } from '@cornerstonejs/tools';
import addVolumesAsIndependentComponents from '@cornerstonejs/tools/tools/displayTools/Labelmap/addVolumesAsIndependentComponents';
import { getSlabThicknessOrDefault } from '@cornerstonejs/tools/utilities/genericViewportToolHelpers';
import {
  viewportSupportsStackCompatibility,
} from '@cornerstonejs/tools/utilities/viewportCapabilities';
import {
  createLegacyVolumeLabelmapPlan,
  legacyHelper,
} from '@cornerstonejs/tools/tools/displayTools/Labelmap/labelmapRenderPlan/legacyVolumePlan';

export function Panel({ viewport }) {
  toolsUtilities.spatial.rotateViewportAroundWorldPoint(
    viewport,
    [0, 0, 0],
    90
  );
  cornerstoneTools.utilities.spatial.rotateViewportAroundWorldPoint(
    viewport,
    [0, 0, 0],
    90
  );

  return (
    <span>
      {String(addVolumesAsIndependentComponents)}{' '}
      {getSlabThicknessOrDefault(viewport)}
      {String(viewportSupportsStackCompatibility(viewport))}{' '}
      {String(createLegacyVolumeLabelmapPlan)}
      {String(legacyHelper)}
    </span>
  );
}
