import { createSynchronizer } from '../../store/SynchronizerManager';
import { Enums } from '@cornerstonejs/core';
import voiSyncCallback from '../callbacks/voiSyncCallback';
import Synchronizer from '../../store/SynchronizerManager/Synchronizer';

/**
 * A helper that creates a new `Synchronizer`
 * which listens to the `VOI_MODIFIED` rendering event and calls the `voiSyncCallback`.
 *
 * @param synchronizerName - The name of the synchronizer.
 *
 * @returns A new `Synchronizer` instance.
 */
export default function createVOISynchronizer(
  synchronizerName: string
): Synchronizer {
  const VOISynchronizer = createSynchronizer(
    synchronizerName,
    Enums.Events.VOI_MODIFIED,
    voiSyncCallback
  );

  return VOISynchronizer;
}
