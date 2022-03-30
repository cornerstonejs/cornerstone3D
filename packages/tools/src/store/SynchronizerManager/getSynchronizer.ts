import { state } from '../index';
import Synchronizer from './Synchronizer';

/**
 * Get the synchronizer with the given id from the state.
 * @param synchronizerId - The id of the synchronizer to be retrieved.
 * @returns A synchronizer object.
 */
function getSynchronizer(synchronizerId: string): Synchronizer | void {
  return state.synchronizers.find((s) => s.id === synchronizerId);
}

export default getSynchronizer;
