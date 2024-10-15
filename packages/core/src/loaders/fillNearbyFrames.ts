import type { ImageLoadListener } from '../types';
import cache from '../cache/cache';

/** Actually fills the nearby frames from the given frame */
export function fillNearbyFrames(listener: ImageLoadListener, request, image) {
  if (!request?.nearbyRequests?.length) {
    // Not filling nearby images with a copy of this
    return;
  }

  for (const nearbyItem of request.nearbyRequests) {
    try {
      const { itemId: targetId, imageQualityStatus } = nearbyItem;
      const currentStatus = cache.getImageQuality(targetId);
      if (currentStatus !== undefined && currentStatus >= imageQualityStatus) {
        console.log(
          'Already have delivered image at quality',
          imageQualityStatus,
          currentStatus,
          cache.getImage(targetId)?.imageQualityStatus,
          cache.getImage
        );
        continue;
      }
      const nearbyImage = {
        ...image,
        imageId: targetId,
        imageQualityStatus,
      };

      // Somehow this should put the object in as a direct deliverable
      console.log('Filling temporary frame for', targetId);
      cache.setPartialImage(targetId, nearbyImage);
      listener.successCallback(targetId, nearbyImage);
    } catch (e) {
      console.log("Couldn't fill nearby item ", nearbyItem.itemId, e);
    }
  }
}
