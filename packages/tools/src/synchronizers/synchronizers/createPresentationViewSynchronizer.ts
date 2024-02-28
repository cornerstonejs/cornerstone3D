import { Enums } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { createSynchronizer } from '../../store/SynchronizerManager';
import presentationViewSyncCallback from '../callbacks/presentationViewSyncCallback';
import Synchronizer from '../../store/SynchronizerManager/Synchronizer';

const { CAMERA_MODIFIED } = Enums.Events;

/**
 * A helper that creates a new `Synchronizer` which listens to the `CAMERA_MODIFIED`
 * rendering event and calls the `cameraSyncCallback` based on presentation view
 * values and not based on absolute camera positions.
 *
 * @param synchronizerName - The name of the synchronizer.
 * @returns A new `Synchronizer` instance.
 */
export default function createPresentationViewSynchronizer(
  synchronizerName: string,
  options?: Types.ViewPresentation
): Synchronizer {
  const presentationView = createSynchronizer(
    synchronizerName,
    CAMERA_MODIFIED,
    presentationViewSyncCallback,
    options
  );

  return presentationView;
}
