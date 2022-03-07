import { createSynchronizer } from '../../store/SynchronizerManager'
import { EVENTS } from '@precisionmetrics/cornerstone-render'
import voiSyncCallback from '../callbacks/voiSyncCallback'
import Synchronizer from '../../store/SynchronizerManager/Synchronizer'

/**
 * A helper that creates a new `Synchronizer`
 * which listens to the `VOI_MODIFIED` rendering event and calls the `voiSyncCallback`.
 *
 * @param synchronizerName - The name of the synchronizer.
 *
 * @returns A new `Synchronizer` instance.
 */
export default function createVOISynchronizer(
  synchronizerName: string
): Synchronizer {
  const VOISynchronizer = createSynchronizer(
    synchronizerName,
    EVENTS.VOI_MODIFIED,
    voiSyncCallback
  )

  return VOISynchronizer
}
