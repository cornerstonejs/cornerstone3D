import type { ImageLoadListener } from '../types';
import type { ImageQualityStatus } from '../enums';

/** Actually fills the nearby frames from the given frame */
export function fillNearbyFrames(
  listener: ImageLoadListener,
  imageQualityStatusMap: Map<string, ImageQualityStatus>,
  request,
  image,
  options
) {
  if (!request?.nearbyRequests?.length) {
    return;
  }

  for (const nearbyItem of request.nearbyRequests) {
    try {
      const { itemId: targetId, imageQualityStatus } = nearbyItem;
      console.log('Trying to fill nearby item', targetId, imageQualityStatus);
      const targetStatus = imageQualityStatusMap.get(targetId);
      if (targetStatus !== undefined && targetStatus >= imageQualityStatus) {
        continue;
      }
      const nearbyImage = {
        ...image,
        imageId: targetId,
        imageQualityStatus,
      };
      listener.successCallback(targetId, nearbyImage);
      imageQualityStatusMap.set(targetId, imageQualityStatus);
    } catch (e) {
      console.log("Couldn't fill nearby item ", nearbyItem.itemId, e);
    }
  }
}
