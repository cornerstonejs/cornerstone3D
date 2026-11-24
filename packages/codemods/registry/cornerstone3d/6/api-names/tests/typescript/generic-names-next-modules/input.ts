import {
  isPlanarNextVolumeViewport,
  type PlanarNextVolumeViewport,
} from '@cornerstonejs/tools/tools/displayTools/Labelmap/labelmapRenderPlan/planarGenericVolumeLabelmap';
import {
  addLabelmapToVolume3DNextViewport,
  isVolume3DNextViewport as isVolume3D,
} from '@cornerstonejs/tools/tools/displayTools/Labelmap/labelmapRenderPlan/volume3DNextLabelmap';
import type { Types } from '@cornerstonejs/core';

export function mount(viewport: Types.IViewport) {
  if (isPlanarNextVolumeViewport(viewport)) {
    return (viewport as PlanarNextVolumeViewport).id;
  }

  return isVolume3D(viewport) ? addLabelmapToVolume3DNextViewport : undefined;
}
