import { getEnabledElementByViewportId, type Types } from '@cornerstonejs/core';

import { SegmentationRepresentations } from '../../../enums';
import { getSegmentationRepresentations } from '../../../stateManagement/segmentation/getSegmentationRepresentation';
import getViewportLabelmapRenderMode from '../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import { syncStackLabelmapActors } from '../../../tools/displayTools/Labelmap/syncStackLabelmapActors';

/**
 * Updates the labelmap for stack viewports
 */
export function performStackLabelmapUpdate({
  viewportIds,
  segmentationId,
}: {
  viewportIds: string[];
  segmentationId: string;
}): void {
  viewportIds.forEach((viewportId) => {
    let representations = getSegmentationRepresentations(viewportId, {
      segmentationId,
    });

    representations = representations.filter(
      (representation) =>
        representation.type === SegmentationRepresentations.Labelmap
    );

    representations.forEach((representation) => {
      if (representation.segmentationId !== segmentationId) {
        return;
      }

      const enabledElement = getEnabledElementByViewportId(viewportId);

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      if (getViewportLabelmapRenderMode(viewport) !== 'image') {
        return;
      }

      if (
        typeof (viewport as { getCurrentImageId?: () => string })
          .getCurrentImageId !== 'function'
      ) {
        return;
      }

      syncStackLabelmapActors(viewport as Types.IStackViewport, segmentationId);
    });
  });
}
