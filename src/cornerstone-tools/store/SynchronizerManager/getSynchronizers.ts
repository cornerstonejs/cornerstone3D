import { state } from './../index'
import Synchronizer from './Synchronizer'

function getSynchronizers(
  renderingEngineUID: string,
  sceneUID: string,
  viewportUID: string
): Array<Synchronizer> {
  const synchronizersFilteredByUIDs = []

  for (let i = 0; i < state.synchronizers.length; i++) {
    const synchronizer = state.synchronizers[i]
    const notDisabled = !synchronizer.isDisabled()
    const hasSourceViewport = synchronizer.hasSourceViewport(
      renderingEngineUID,
      sceneUID,
      viewportUID
    )

    if (notDisabled && hasSourceViewport) {
      synchronizersFilteredByUIDs.push(synchronizer)
    }
  }

  return synchronizersFilteredByUIDs
}

export default getSynchronizers
