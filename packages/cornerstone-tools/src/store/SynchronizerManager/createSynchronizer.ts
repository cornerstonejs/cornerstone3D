import { state } from '../index'
import Synchronizer, { ISynchronizerEventHandler } from './Synchronizer'

function createSynchronizer(
  synchronizerId: string,
  eventName: string,
  eventHandler: ISynchronizerEventHandler
): Synchronizer {
  const synchronizerWithSameIdExists = state.synchronizers.some(
    (sync) => sync.id === synchronizerId
  )

  if (synchronizerWithSameIdExists) {
    throw new Error(`Synchronizer with id '${synchronizerId}' already exists.`)
  }

  // Create
  const synchronizer = new Synchronizer(synchronizerId, eventName, eventHandler)

  // Update state
  state.synchronizers.push(synchronizer)

  // Return reference
  return synchronizer
}

export default createSynchronizer
