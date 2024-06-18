import { state } from '../index.js';
import Synchronizer from './Synchronizer.js';

/**
 * Return the array of synchronizers
 * @returns An array of synchronizers.
 */
function getAllSynchronizers(): Array<Synchronizer> {
  return state.synchronizers;
}

export default getAllSynchronizers;
