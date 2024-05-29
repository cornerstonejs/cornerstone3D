import { createSynchronizer } from '../../store/SynchronizerManager/index.js';
import { Enums } from '@cornerstonejs/core';
import cameraSyncCallback from '../callbacks/cameraSyncCallback.js';
import Synchronizer from '../../store/SynchronizerManager/Synchronizer.js';

const { CAMERA_MODIFIED } = Enums.Events;

/**
 * A helper that creates a new `Synchronizer` which listens to the `CAMERA_MODIFIED`
 * rendering event and calls the `cameraSyncCallback`.
 *
 * @param synchronizerName - The name of the synchronizer.
 * @returns A new `Synchronizer` instance.
 */
export default function createCameraPositionSynchronizer(
  synchronizerName: string
): Synchronizer {
  const cameraPositionSynchronizer = createSynchronizer(
    synchronizerName,
    CAMERA_MODIFIED,
    cameraSyncCallback
  );

  return cameraPositionSynchronizer;
}
