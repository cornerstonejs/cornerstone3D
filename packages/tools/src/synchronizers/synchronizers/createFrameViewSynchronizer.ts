import { createSynchronizer } from '../../store/SynchronizerManager';
import { Enums } from '@cornerstonejs/core';
import frameViewSyncCallback from '../callbacks/frameViewSyncCallback';
import Synchronizer from '../../store/SynchronizerManager/Synchronizer';

const { CAMERA_MODIFIED } = Enums.Events;

/**
 * A helper that creates a new `Synchronizer` which listens to the `CAMERA_MODIFIED`
 * rendering event and calls the `FrameViewSyncCallback`.
 *
 * @param synchronizerName - The name of the synchronizer.
 * @returns A new `Synchronizer` instance.
 */
export default function createFrameViewSynchronizer(
  synchronizerName: string
): Synchronizer {
  const frameViewSynchronizer = createSynchronizer(
    synchronizerName,
    CAMERA_MODIFIED,
    frameViewSyncCallback
  );

  return frameViewSynchronizer;
}
