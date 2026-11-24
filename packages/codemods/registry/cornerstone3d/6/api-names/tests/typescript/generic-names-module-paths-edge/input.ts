import * as labelmaps from '@cornerstonejs/tools/tools/displayTools/Labelmap/labelmapRenderPlan/planarGenericVolumeLabelmap';
import * as helpers from "@cornerstonejs/tools/utilities/genericViewportToolHelpers.js";
import type IGenericViewport from '@cornerstonejs/core/types/IGenericViewport';

export { resolveGenericViewportVolumeId } from '@cornerstonejs/core/utilities/resolveGenericViewportVolumeId';
export {
  resolveGenericViewportVolumeId as resolveVolumeId,
} from '@cornerstonejs/core/utilities/resolveGenericViewportVolumeId';
export * from '@cornerstonejs/tools/utilities/genericViewportToolHelpers';

export function run(viewport: IGenericViewport) {
  return [labelmaps.addLabelmapToPlanarGenericViewport, helpers.jumpToFocalPoint, viewport];
}
