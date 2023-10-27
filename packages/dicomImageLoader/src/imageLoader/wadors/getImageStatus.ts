import { Types, Enums } from '@cornerstonejs/core';

const { ImageStatus } = Enums;

/** Gets the status of returned images */
export function getImageStatus(
  retrieveOptions: Types.RetrieveOptions,
  done = true
) {
  if (!done) {
    return retrieveOptions?.partialStatus ?? ImageStatus.SUBRESOLUTION;
  }
  return retrieveOptions.status || ImageStatus.FULL_RESOLUTION;
}
