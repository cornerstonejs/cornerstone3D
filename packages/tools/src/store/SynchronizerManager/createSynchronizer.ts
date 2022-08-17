import { state } from '../index';
import Synchronizer from './Synchronizer';
import { ISynchronizerEventHandler } from '../../types';

/**
 * Create a new synchronizer instance from Synchronizer class
 * @param synchronizerId - The id of the synchronizer.
 * @param eventName - The name of the event that will be emitted by the
 * synchronizer.
 * @param eventHandler - The event handler that will be
 * called when the event is emitted.
 * @returns A reference to the synchronizer.
 */
function createSynchronizer(
  synchronizerId: string,
  eventName: string,
  eventHandler: ISynchronizerEventHandler
): Synchronizer {
  const synchronizerWithSameIdExists = state.synchronizers.some(
    (sync) => sync.id === synchronizerId
  );

  if (synchronizerWithSameIdExists) {
    throw new Error(`Synchronizer with id '${synchronizerId}' already exists.`);
  }

  // Create
  const synchronizer = new Synchronizer(
    synchronizerId,
    eventName,
    eventHandler
  );

  // Update state
  state.synchronizers.push(synchronizer);

  // Return reference
  return synchronizer;
}

export default createSynchronizer;
