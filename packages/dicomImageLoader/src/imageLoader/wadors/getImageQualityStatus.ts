import type { Types } from '@cornerstonejs/core';
import { Enums } from '@cornerstonejs/core';

const { ImageQualityStatus } = Enums;

/** Gets the status of returned images */
export function getImageQualityStatus(
  retrieveOptions: Types.RetrieveOptions,
  done = true
) {
  if (!done) {
    // A truncated HTJ2K codestream decoded at decodeLevel 0 yields a full size
    // image that is merely lossy, while any other level yields a smaller image
    // that has to be scaled up afterwards.  Those are different qualities, and
    // distinguishing them is what lets a later stage replace an earlier one.
    return retrieveOptions.decodeLevel === 0
      ? ImageQualityStatus.LOSSY
      : ImageQualityStatus.SUBRESOLUTION;
  }
  return (
    retrieveOptions.imageQualityStatus ?? ImageQualityStatus.FULL_RESOLUTION
  );
}
