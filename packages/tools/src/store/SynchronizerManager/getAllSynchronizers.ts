import { state } from '../../store/state';
import Synchronizer from './Synchronizer';

/**
 * Return the array of synchronizers
 * @returns An array of synchronizers.
 */
function getAllSynchronizers(): Array<Synchronizer> {
  return state.synchronizers;
}

export default getAllSynchronizers;
