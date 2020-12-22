import { SynchronizerManager } from '../../store/';
import { Events as RENDERING_EVENTS } from '../../../index';
import voiSyncCallback from '../callbacks/voiSyncCallback';
import Synchronizer from '../../store/SynchronizerManager/Synchronizer';

const { VOI_MODIFIED } = RENDERING_EVENTS;

/**
 * @function createVOISynchronizer A helper that creates a new `Synchronizer`
 * which listens to the `VOI_MODIFIED` rendering event and calls the `voiSyncCallback`.
 *
 * @param {string} synchronizerName The name of the synchronizer.
 *
 * @returns {Synchronizer} A new `Synchronizer` instance.
 */
export default function createVOISynchronizer(synchronizerName): Synchronizer {
  const cameraPositionSyncrhonizer = SynchronizerManager.createSynchronizer(
    synchronizerName,
    VOI_MODIFIED,
    voiSyncCallback
  );

  return cameraPositionSyncrhonizer;
}
