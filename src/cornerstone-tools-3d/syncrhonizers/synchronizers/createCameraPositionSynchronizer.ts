import { SynchronizerManager } from '../../store/';
import { Events as RENDERING_EVENTS } from '../../../index';
import cameraSyncCallback from '../callbacks/cameraSyncCallback';

const { CAMERA_MODIFIED } = RENDERING_EVENTS;

export default function createCameraPositionSynchronizer(synchronizerName) {
  const cameraPositionSyncrhonizer = SynchronizerManager.createSynchronizer(
    synchronizerName,
    CAMERA_MODIFIED,
    cameraSyncCallback
  );

  return cameraPositionSyncrhonizer;
}
