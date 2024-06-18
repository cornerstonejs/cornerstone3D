import { createSynchronizer } from '../../store/SynchronizerManager/index.js';
import { Enums } from '@cornerstonejs/core';
import stackImageSyncCallback from '../callbacks/stackImageSyncCallback.js';
import Synchronizer from '../../store/SynchronizerManager/Synchronizer.js';

const { STACK_NEW_IMAGE } = Enums.Events;

/**
 * A helper that creates a new `Synchronizer` which listens to the `STACK_NEW_IMAGE`
 * rendering event and calls the `stackImageSyncCallback`.
 *
 * @param synchronizerName - The name of the synchronizer.
 * @returns A new `Synchronizer` instance.
 */
export default function createStackImageSynchronizer(
  synchronizerName: string
): Synchronizer {
  const stackImageSynchronizer = createSynchronizer(
    synchronizerName,
    STACK_NEW_IMAGE,
    stackImageSyncCallback
  );

  return stackImageSynchronizer;
}
