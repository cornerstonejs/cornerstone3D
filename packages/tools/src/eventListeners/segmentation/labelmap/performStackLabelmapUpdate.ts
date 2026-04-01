import {
  cache,
  utilities as csUtils,
  VolumeViewport,
  getEnabledElementByViewportId,
} from '@cornerstonejs/core';

import { SegmentationRepresentations } from '../../../enums';
import { getLabelmapActorEntries } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';
import { getSegmentationRepresentations } from '../../../stateManagement/segmentation/getSegmentationRepresentation';
import { getCurrentLabelmapImageIdsForViewport } from '../../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';

const log = csUtils.logger.toolsLog.getLogger('performStackLabelmapUpdate');

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

      if (viewport instanceof VolumeViewport) {
        return;
      }

      const actorEntries = getLabelmapActorEntries(viewportId, segmentationId);

      if (!actorEntries?.length) {
        return;
      }

      const currentSegmentationImageIds = getCurrentLabelmapImageIdsForViewport(
        viewportId,
        segmentationId
      );
      const imageIdsArray = currentSegmentationImageIds ?? [];
      const imageIdsLength = imageIdsArray.length;

      actorEntries.forEach((actorEntry, i) => {
        const segImageData = actorEntry.actor.getMapper().getInputData();

        const imageId = currentSegmentationImageIds?.[i];
        if (imageId === undefined) {
          log.error(
            'Stack labelmap update skipped: labelmap imageId is undefined for actor index i (getImage would throw).',
            i,
            actorEntries.length,
            imageIdsLength,
            [...imageIdsArray],
            currentSegmentationImageIds?.[i],
            viewportId,
            segmentationId
          );
          return;
        }

        const segmentationImage = cache.getImage(imageId);
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
