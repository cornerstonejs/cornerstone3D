import { resolveViewportVolumeId as resolveGenericViewportVolumeId } from '@cornerstonejs/core/utilities/resolveViewportVolumeId';
import {
  jumpToFocalPoint,
  navigatePlanarViewportToPoint,
} from '@cornerstonejs/tools/utilities/viewportToolHelpers';
import { addLabelmapToPlanarVolumeViewport as addLabelmap } from '@cornerstonejs/tools/tools/displayTools/Labelmap/labelmapRenderPlan/planarVolumeLabelmap';
import type { IGenericViewport } from '@cornerstonejs/core/types/IGenericViewport';
import type { Types } from '@cornerstonejs/core';

export function centre(viewport: IGenericViewport, point: Types.Point3) {
  navigatePlanarViewportToPoint(viewport, point);
  jumpToFocalPoint(viewport, point);

  return [resolveGenericViewportVolumeId(viewport), addLabelmap];
}
