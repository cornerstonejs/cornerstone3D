import { SynchronizerManager } from '../../store/';
import { Events as RENDERING_EVENTS } from '../../../index';
import voiSyncCallback from '../callbacks/voiSyncCallback';

const { VOI_MODIFIED } = RENDERING_EVENTS;

export default function createVOISynchronizer(synchronizerName) {
  const cameraPositionSyncrhonizer = SynchronizerManager.createSynchronizer(
    synchronizerName,
    VOI_MODIFIED,
    voiSyncCallback
  );

  return cameraPositionSyncrhonizer;
}
