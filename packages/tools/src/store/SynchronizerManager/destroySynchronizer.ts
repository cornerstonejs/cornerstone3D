import { state } from '../index';

// Synchronizers are a bit more tenacious. We need to make sure we remove
// any attached events
// We should probably just have a destroySynchronizer call
// then use getByX to allow versatility in how we can call destroy

/**
 * Destroy a synchronizer by its ID.
 * @param synchronizerId - The id of the synchronizer to destroy.
 */
function destroySynchronizer(synchronizerId: string): void {
  const synchronizerIndex = state.synchronizers.findIndex(
    (sync) => sync.id === synchronizerId
  );

  if (synchronizerIndex > -1) {
    const synchronizer = state.synchronizers[synchronizerIndex];

    synchronizer.destroy();
    state.synchronizers.splice(synchronizerIndex, 1);
  }
}

export default destroySynchronizer;
