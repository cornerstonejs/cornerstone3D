import { state } from '../index'
import Synchronizer from './Synchronizer'

/**
 * It returns all synchronizers that are not disabled and have a source viewport
 * with the given rendering engine UID and viewport UID
 * @param renderingEngineUID - The UID of the rendering engine
 * @param viewportUID - The UID of the viewport
 * @returns An array of synchronizers
 */
function getSynchronizers(
  renderingEngineUID: string,
  viewportUID: string
): Array<Synchronizer> {
  const synchronizersFilteredByUIDs = []

  if (!renderingEngineUID && !viewportUID) {
    throw new Error(
      'At least one of renderingEngineUID or viewportUID should be given'
    )
  }

  for (let i = 0; i < state.synchronizers.length; i++) {
    const synchronizer = state.synchronizers[i]
    const notDisabled = !synchronizer.isDisabled()
    const hasSourceViewport = synchronizer.hasSourceViewport(
      renderingEngineUID,
      viewportUID
    )

    if (notDisabled && hasSourceViewport) {
      synchronizersFilteredByUIDs.push(synchronizer)
    }
  }

  return synchronizersFilteredByUIDs
}

export default getSynchronizers
