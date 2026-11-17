import { createSynchronizer } from '../../store/SynchronizerManager';
import { Enums } from '@cornerstonejs/core';
import imageSliceSyncCallback from '../callbacks/imageSliceSyncCallback';
import type Synchronizer from '../../store/SynchronizerManager/Synchronizer';

const { NEW_IMAGE } = Enums.Events;

/**
 * A helper that creates a new `Synchronizer` which listens to the `NEW_IMAGE`
 * rendering event and calls the `ImageSliceSyncCallback`. A viewport fires the
 * event for another image of a stack and for another slice of a volume.
 *
 * @param synchronizerName - The name of the synchronizer.
 * @returns A new `Synchronizer` instance.
 */
export default function createImageSliceSynchronizer(
  synchronizerName: string
): Synchronizer {
  const imageSliceSynchronizer = createSynchronizer(
    synchronizerName,
    NEW_IMAGE,
    imageSliceSyncCallback
  );

  return imageSliceSynchronizer;
}
