import { Enums } from '@cornerstonejs/core';
import { createSynchronizer } from '../../store/SynchronizerManager';
import slabThicknessSyncCallback from '../callbacks/slabThicknessSyncCallback';
import type Synchronizer from '../../store/SynchronizerManager/Synchronizer';

const { CAMERA_MODIFIED } = Enums.Events;

/**
 * A helper that creates a new `Synchronizer` which listens to the `CAMERA_MODIFIED`
 * rendering event and calls `slabThicknessSyncCallback`, which copies the slab
 * thickness of the appearance of the source display set.
 *
 * @param synchronizerName - The name of the synchronizer.
 * @returns A new `Synchronizer` instance.
 */
export default function createSlabThicknessSynchronizer(
  synchronizerName: string
): Synchronizer {
  const slabThicknessSynchronizer = createSynchronizer(
    synchronizerName,
    CAMERA_MODIFIED,
    slabThicknessSyncCallback
  );

  return slabThicknessSynchronizer;
}
