import type { ImageLoadListener } from '../types';
import type { ImageQualityStatus } from '../enums';
import cache from '../cache/cache';

/** Actually fills the nearby frames from the given frame */
export function fillNearbyFrames(
  listener: ImageLoadListener,
  imageQualityStatusMap: Map<string, ImageQualityStatus>,
  request,
  image
) {
  if (!request?.nearbyRequests?.length) {
    console.log('Request has no nearby frames', image.imageId);
    return;
  }

  for (const nearbyItem of request.nearbyRequests) {
    try {
      const { itemId: targetId, imageQualityStatus } = nearbyItem;
      const currentStatus = imageQualityStatusMap.get(targetId);
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
      cache.putTemporaryImage(targetId, nearbyImage);
      listener.successCallback(targetId, nearbyImage);
      imageQualityStatusMap.set(targetId, imageQualityStatus);
    } catch (e) {
      console.log("Couldn't fill nearby item ", nearbyItem.itemId, e);
    }
  }
}
