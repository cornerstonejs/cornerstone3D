import React, { useEffect } from 'react';
import { synchronizers } from '@cornerstonejs/tools';

export function SliceSync({ renderingEngineId, viewportIds }) {
  useEffect(() => {
    const sync = synchronizers.createStackImageSynchronizer('slice-sync');

    viewportIds.forEach((viewportId) =>
      sync.add({ renderingEngineId, viewportId })
    );

    return () => sync.destroy();
  }, [renderingEngineId, viewportIds]);

  return <span data-sync="slice-sync" />;
}
