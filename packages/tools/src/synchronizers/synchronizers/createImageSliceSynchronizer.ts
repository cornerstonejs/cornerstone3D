import { createSynchronizer } from '../../store/SynchronizerManager';
import { Enums } from '@cornerstonejs/core';
import imageSliceSyncCallback from '../callbacks/imageSliceSyncCallback';
import Synchronizer from '../../store/SynchronizerManager/Synchronizer';

const { STACK_NEW_IMAGE, VOLUME_NEW_IMAGE } = Enums.Events;

/**
 * A helper that creates a new `Synchronizer` which listens to the `STACK_NEW_IMAGE`
 * rendering event and calls the `ImageSliceSyncCallback`.
 *
 * @param synchronizerName - The name of the synchronizer.
 * @returns A new `Synchronizer` instance.
 */
export default function createImageSliceSynchronizer(
  synchronizerName: string
): Synchronizer {
  const stackImageSynchronizer = createSynchronizer(
    synchronizerName,
    STACK_NEW_IMAGE,
    imageSliceSyncCallback,
    {
      auxiliaryEventNames: [VOLUME_NEW_IMAGE],
    }
  );

  return stackImageSynchronizer;
}
