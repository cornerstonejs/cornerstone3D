import { state } from './../index'
import Synchronizer, { ISynchronizerEventHandler } from './Synchronizer'

function createSynchronizer(
  synchronizerId: string,
  eventName: string,
  eventHandler: ISynchronizerEventHandler
): Synchronizer | undefined {
  const toolGroupWithIdExists = state.synchronizers.some(
    (tg) => tg.id === synchronizerId
  )

  if (toolGroupWithIdExists) {
    console.warn(`'${synchronizerId}' already exists.`)
    return
  }

  // Create
  const synchronizer = new Synchronizer(synchronizerId, eventName, eventHandler)

  // Update state
  state.synchronizers.push(synchronizer)

  // Return reference
  return synchronizer
}

export default createSynchronizer
