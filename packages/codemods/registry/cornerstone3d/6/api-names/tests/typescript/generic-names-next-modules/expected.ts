import {
  isPlanarVolumeViewport as isPlanarNextVolumeViewport,
  type PlanarVolumeViewport as PlanarNextVolumeViewport,
} from '@cornerstonejs/tools/tools/displayTools/Labelmap/labelmapRenderPlan/planarVolumeLabelmap';
import {
  addLabelmapToVolume3DViewport as addLabelmapToVolume3DNextViewport,
  isVolume3DViewport as isVolume3D,
} from '@cornerstonejs/tools/tools/displayTools/Labelmap/labelmapRenderPlan/volume3DLabelmap';
import type { Types } from '@cornerstonejs/core';

export function mount(viewport: Types.IViewport) {
  if (isPlanarNextVolumeViewport(viewport)) {
    return (viewport as PlanarNextVolumeViewport).id;
  }

  return isVolume3D(viewport) ? addLabelmapToVolume3DNextViewport : undefined;
}
