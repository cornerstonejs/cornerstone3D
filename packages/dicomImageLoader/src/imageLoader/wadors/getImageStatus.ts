import { Types, Enums } from '@cornerstonejs/core';

const { ImageStatus } = Enums;

/** Gets the status of returned images */
export function getImageStatus(
  retrieveOptions: Types.RetrieveOptions,
  done = true
) {
  if (!done) {
    return retrieveOptions?.partialStatus ?? ImageStatus.PARTIAL;
  }
  if (retrieveOptions?.isLossy) {
    return retrieveOptions.status || ImageStatus.LOSSY;
  }
  return retrieveOptions.status || ImageStatus.DONE;
}
