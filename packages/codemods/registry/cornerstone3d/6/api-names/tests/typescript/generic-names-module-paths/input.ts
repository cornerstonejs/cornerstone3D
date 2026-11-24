import { resolveGenericViewportVolumeId } from '@cornerstonejs/core/utilities/resolveGenericViewportVolumeId';
import {
  jumpToFocalPoint,
  navigatePlanarViewportToPoint,
} from '@cornerstonejs/tools/utilities/genericViewportToolHelpers';
import { addLabelmapToPlanarGenericViewport as addLabelmap } from '@cornerstonejs/tools/tools/displayTools/Labelmap/labelmapRenderPlan/planarGenericVolumeLabelmap';
import type { IGenericViewport } from '@cornerstonejs/core/types/IGenericViewport';
import type { Types } from '@cornerstonejs/core';

export function centre(viewport: IGenericViewport, point: Types.Point3) {
  navigatePlanarViewportToPoint(viewport, point);
  jumpToFocalPoint(viewport, point);

  return [resolveGenericViewportVolumeId(viewport), addLabelmap];
}
