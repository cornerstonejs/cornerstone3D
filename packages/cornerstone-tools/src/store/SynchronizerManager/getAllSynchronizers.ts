import { state } from '../index'
import Synchronizer from './Synchronizer'

function getAllSynchronizers(): Array<Synchronizer> {
  return state.synchronizers
}

export default getAllSynchronizers
