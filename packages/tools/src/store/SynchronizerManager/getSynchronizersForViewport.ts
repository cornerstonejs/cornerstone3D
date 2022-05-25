import { state } from '../index';
import Synchronizer from './Synchronizer';

/**
 * It returns all synchronizers that are not disabled and have a source viewport
 * with the given rendering engine Id and viewport Id
 * @param renderingEngineId - The Id of the rendering engine
 * @param viewportId - The Id of the viewport
 * @returns An array of synchronizers
 */
function getSynchronizersForViewport(
  viewportId: string,
  renderingEngineId: string
): Array<Synchronizer> {
  const synchronizersFilteredByIds = [];

  if (!renderingEngineId && !viewportId) {
    throw new Error(
      'At least one of renderingEngineId or viewportId should be given'
    );
  }

  for (let i = 0; i < state.synchronizers.length; i++) {
    const synchronizer = state.synchronizers[i];
    const notDisabled = !synchronizer.isDisabled();
    const hasSourceViewport = synchronizer.hasSourceViewport(
      renderingEngineId,
      viewportId
    );

    const hasTargetViewport = synchronizer.hasTargetViewport(
      renderingEngineId,
      viewportId
    );

    if (notDisabled && (hasSourceViewport || hasTargetViewport)) {
      synchronizersFilteredByIds.push(synchronizer);
    }
  }

  return synchronizersFilteredByIds;
}

export default getSynchronizersForViewport;
