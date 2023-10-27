import { Types, Enums } from '@cornerstonejs/core';

const { ImageQualityStatus } = Enums;

/** Gets the status of returned images */
export function getImageQualityStatus(
  retrieveOptions: Types.RetrieveOptions,
  done = true
) {
  if (!done) {
    return retrieveOptions?.partialStatus ?? ImageQualityStatus.SUBRESOLUTION;
  }
  return retrieveOptions.status || ImageQualityStatus.FULL_RESOLUTION;
}
