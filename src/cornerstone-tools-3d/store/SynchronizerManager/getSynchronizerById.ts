import { state } from './../index'
import Synchronizer from './Synchronizer'

function getSynchronizerById(synchronizerId: string): Synchronizer | void {
  return state.synchronizers.find((s) => s.id === synchronizerId)
}

export default getSynchronizerById
