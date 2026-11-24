import { createSynchronizer } from '../../store/SynchronizerManager';
import { Enums } from '@cornerstonejs/core';
import voiSyncCallback from '../callbacks/voiSyncCallback';
import type Synchronizer from '../../store/SynchronizerManager/Synchronizer';
import type { ISynchronizerEventHandler } from '../../types';

type VOISynchronizerOptions = {
  syncInvertState: boolean;
  syncColormap: boolean;
};

/**
 * A helper that creates a new `Synchronizer` which listens to the
 * `DISPLAY_SET_APPEARANCE_CHANGED` rendering event and calls the
 * `voiSyncCallback`, which copies the window (and the invert, and the
 * colormap with the opacity) that a caller set or reset, never a default.
 *
 * @param synchronizerName - The name of the synchronizer.
 * @param options - The options for the synchronizer. By default the voi
 * synchronizer will also sync the invert state of the volume, but this can be
 * disabled by setting `syncInvertState` to false.
 *
 * @returns A new `Synchronizer` instance.
 */
export default function createVOISynchronizer(
  synchronizerName: string,
  options: VOISynchronizerOptions
): Synchronizer {
  //  = { syncInvertState: true } if options is not provided or undefined or {}
  options = Object.assign(
    { syncInvertState: true, syncColormap: true },
    options
  );

  const VOISynchronizer = createSynchronizer(
    synchronizerName,
    Enums.Events.DISPLAY_SET_APPEARANCE_CHANGED,
    voiSyncCallback as ISynchronizerEventHandler,
    options
  );

  return VOISynchronizer;
}
