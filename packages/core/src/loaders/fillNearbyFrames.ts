import { ImageLoadListener } from '../types';
import { ImageQualityStatus } from '../enums';

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

  const {
    arrayBuffer,
    offset: srcOffset,
    type,
    length: frameLength,
  } = options.targetBuffer;
  if (!arrayBuffer || srcOffset === undefined || !type) {
    return;
  }
  const scalarData = new Float32Array(arrayBuffer);
  const bytesPerPixel = scalarData.byteLength / scalarData.length;
  const offset = options.targetBuffer.offset / bytesPerPixel; // in bytes

  // since set is based on the underlying type,
  // we need to divide the offset bytes by the byte type
  const src = scalarData.slice(offset, offset + frameLength);

  for (const nearbyItem of request.nearbyRequests) {
    try {
      const { itemId: targetId, imageQualityStatus } = nearbyItem;
      const targetStatus = imageQualityStatusMap.get(targetId);
      if (targetStatus !== undefined && targetStatus >= imageQualityStatus) {
        continue;
      }
      const targetOptions = listener.getLoaderImageOptions(targetId);
      const { offset: targetOffset } = targetOptions.targetBuffer as any;
      scalarData.set(src, targetOffset / bytesPerPixel);
      const nearbyImage = {
        ...image,
        imageQualityStatus,
      };
      listener.successCallback(targetId, nearbyImage);
      imageQualityStatusMap.set(targetId, imageQualityStatus);
    } catch (e) {
      console.log("Couldn't fill nearby item ", nearbyItem.itemId, e);
    }
  }
}
