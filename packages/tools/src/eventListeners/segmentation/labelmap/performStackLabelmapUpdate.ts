import {
  cache,
  utilities as csUtils,
  getEnabledElementByViewportId,
  BaseVolumeViewport,
} from '@cornerstonejs/core';

import { SegmentationRepresentations } from '../../../enums';
import { getLabelmapActorEntries } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';
import { getSegmentationRepresentations } from '../../../stateManagement/segmentation/getSegmentationRepresentation';
import { getCurrentLabelmapImageIdsForViewport } from '../../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';

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

      if (viewport instanceof BaseVolumeViewport) {
        return;
      }

      const actorEntries = getLabelmapActorEntries(viewportId, segmentationId);

      if (!actorEntries?.length) {
        return;
      }

      actorEntries.forEach((actorEntry, i) => {
        const segImageData = actorEntry.actor.getMapper().getInputData();

        const currentSegmentationImageIds =
          getCurrentLabelmapImageIdsForViewport(viewportId, segmentationId);

        const segmentationImage = cache.getImage(
          currentSegmentationImageIds[i]
        );
        segImageData.modified();

        // update the cache with the new image data
        csUtils.updateVTKImageDataWithCornerstoneImage(
          segImageData,
          segmentationImage
        );
      });
    });
  });
}
