import { createSynchronizer } from '../../store/SynchronizerManager/index.js';
import { Enums } from '@cornerstonejs/core';
import zoomPanSyncCallback from '../callbacks/zoomPanSyncCallback.js';
import Synchronizer from '../../store/SynchronizerManager/Synchronizer.js';

const { CAMERA_MODIFIED } = Enums.Events;

/**
 * A helper that creates a new `Synchronizer` which listens to the `CAMERA_MODIFIED`
 * rendering event and calls the `cameraSyncCallback`.
 *
 * @param synchronizerName - The name of the synchronizer.
 * @returns A new `Synchronizer` instance.
 */
export default function createZoomPanSynchronizer(
  synchronizerName: string
): Synchronizer {
  const zoomPanSynchronizer = createSynchronizer(
    synchronizerName,
    CAMERA_MODIFIED,
    zoomPanSyncCallback
  );

  return zoomPanSynchronizer;
}
