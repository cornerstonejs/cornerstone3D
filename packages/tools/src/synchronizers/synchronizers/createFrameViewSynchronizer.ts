import { createSynchronizer } from '../../store/SynchronizerManager';
import { Enums } from '@cornerstonejs/core';
import frameViewSyncCallback from '../callbacks/frameViewSyncCallback';
import Synchronizer from '../../store/SynchronizerManager/Synchronizer';

const { STACK_NEW_IMAGE } = Enums.Events;

/**
 * A helper that creates a new `Synchronizer` which listens to the `STACK_NEW_IMAGE`
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
    STACK_NEW_IMAGE,
    frameViewSyncCallback
  );

  return frameViewSynchronizer;
}
