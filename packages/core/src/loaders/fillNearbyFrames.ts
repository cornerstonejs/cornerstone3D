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
        continue;
      }
      const nearbyImage = {
        ...image,
        imageId: targetId,
        imageQualityStatus,
      };

      // This will deliver the partial image as something that can be
      // immediate rendered, but won't replace any future fetches.
      cache.setPartialImage(targetId, nearbyImage);
      listener.successCallback(targetId, nearbyImage);
    } catch (e) {
      console.warn("Couldn't fill nearby item ", nearbyItem.itemId, e);
    }
  }
}
