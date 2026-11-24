import * as labelmaps from '@cornerstonejs/tools/tools/displayTools/Labelmap/labelmapRenderPlan/planarVolumeLabelmap';
import * as helpers from "@cornerstonejs/tools/utilities/viewportToolHelpers.js";
import type IGenericViewport from '@cornerstonejs/core/types/IGenericViewport';

export { resolveViewportVolumeId as resolveGenericViewportVolumeId } from '@cornerstonejs/core/utilities/resolveViewportVolumeId';
export {
  resolveViewportVolumeId as resolveVolumeId,
} from '@cornerstonejs/core/utilities/resolveViewportVolumeId';
export * from '@cornerstonejs/tools/utilities/viewportToolHelpers';

export function run(viewport: IGenericViewport) {
  return [labelmaps.addLabelmapToPlanarGenericViewport, helpers.jumpToFocalPoint, viewport];
}
