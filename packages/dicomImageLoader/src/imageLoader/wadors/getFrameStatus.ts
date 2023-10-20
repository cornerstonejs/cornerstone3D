import { Types, Enums } from '@cornerstonejs/core';

const { FrameStatus } = Enums;

/** Gets the status of returned images */
export function getFrameStatus(
  retrieveOptions: Types.LossyConfiguration,
  done = true
) {
  if (!done) {
    return retrieveOptions?.partialStatus || FrameStatus.PARTIAL;
  }
  if (retrieveOptions?.isLossy) {
    return retrieveOptions.status || FrameStatus.LOSSY;
  }
  return retrieveOptions.status || FrameStatus.DONE;
}
