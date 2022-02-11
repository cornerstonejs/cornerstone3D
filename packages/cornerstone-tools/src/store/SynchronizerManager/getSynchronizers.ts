import { Types } from '@precisionmetrics/cornerstone-render'
import { state } from '../index'
import Synchronizer from './Synchronizer'

function getSynchronizers({
  renderingEngineUID,
  viewportUID,
}: Types.IViewportUID): Array<Synchronizer> {
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
