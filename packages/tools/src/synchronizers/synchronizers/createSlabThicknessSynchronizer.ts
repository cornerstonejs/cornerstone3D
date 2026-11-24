import { Enums } from '@cornerstonejs/core';
import { createSynchronizer } from '../../store/SynchronizerManager';
import slabThicknessSyncCallback from '../callbacks/slabThicknessSyncCallback';
import type Synchronizer from '../../store/SynchronizerManager/Synchronizer';
import type { ISynchronizerEventHandler } from '../../types';

const { DISPLAY_SET_APPEARANCE_CHANGED } = Enums.Events;

/**
 * A helper that creates a new `Synchronizer` which listens to the
 * `DISPLAY_SET_APPEARANCE_CHANGED` rendering event and calls
 * `slabThicknessSyncCallback`, which copies the slab thickness of the
 * appearance of the source display set when it changed.
 *
 * @param synchronizerName - The name of the synchronizer.
 * @returns A new `Synchronizer` instance.
 */
export default function createSlabThicknessSynchronizer(
  synchronizerName: string
): Synchronizer {
  const slabThicknessSynchronizer = createSynchronizer(
    synchronizerName,
    DISPLAY_SET_APPEARANCE_CHANGED,
    slabThicknessSyncCallback as ISynchronizerEventHandler
  );

  return slabThicknessSynchronizer;
}
