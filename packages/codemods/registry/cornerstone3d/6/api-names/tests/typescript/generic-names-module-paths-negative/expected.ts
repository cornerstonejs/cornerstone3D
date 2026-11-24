import { resolveGenericViewportVolumeId } from './utilities/resolveGenericViewportVolumeId';
import { jumpToFocalPoint } from '../app/genericViewportToolHelpers';
import { addLabelmapToPlanarGenericViewport } from '@ohif/extension-cornerstone/planarGenericVolumeLabelmap';
import { getViewSlabDepthOfViewport } from '@cornerstonejs/tools/utilities/viewportToolHelpers';

export function run(viewport: unknown) {
  jumpToFocalPoint(viewport);

  return [
    resolveGenericViewportVolumeId(viewport),
    addLabelmapToPlanarGenericViewport,
    getViewSlabDepthOfViewport(viewport),
  ];
}
