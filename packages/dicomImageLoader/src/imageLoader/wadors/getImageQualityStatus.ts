import type { Types } from '@cornerstonejs/core';
import { Enums } from '@cornerstonejs/core';

const { ImageQualityStatus } = Enums;

/** Gets the status of returned images */
export function getImageQualityStatus(
  retrieveOptions: Types.RetrieveOptions,
  done = true
) {
  if (!done) {
    return ImageQualityStatus.SUBRESOLUTION;
  }
  return (
    retrieveOptions.imageQualityStatus ?? ImageQualityStatus.FULL_RESOLUTION
  );
}
