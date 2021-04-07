import { SynchronizerManager } from '../../store'
import { EVENTS as RENDERING_EVENTS } from '@cornerstone'
import cameraSyncCallback from '../callbacks/cameraSyncCallback'
import Synchronizer from '../../store/SynchronizerManager/Synchronizer'

const { CAMERA_MODIFIED } = RENDERING_EVENTS

/**
 * @function createCameraPositionSynchronizer A helper that creates a new `Synchronizer`
 * which listens to the `CAMERA_MODIFIED` rendering event and calls the `cameraSyncCallback`.
 *
 * @param {string} synchronizerName The name of the synchronizer.
 *
 * @returns {Synchronizer} A new `Synchronizer` instance.
 */
export default function createCameraPositionSynchronizer(
  synchronizerName: string
): Synchronizer {
  const cameraPositionSynchronizer = SynchronizerManager.createSynchronizer(
    synchronizerName,
    CAMERA_MODIFIED,
    cameraSyncCallback
  )

  return cameraPositionSynchronizer
}
