import React from 'react';
import * as cornerstone from '@cornerstonejs/core';
import { utilities as csUtils, volumeLoader } from '@cornerstonejs/core';

export function Viewer({ engine, imageIds, volumeId }) {
  const viewport = engine.getViewport('ct');

  const load = async () => {
    await volumeLoader.createAndCacheVolume('ct', { imageIds });
    await viewport.setVolumes([
      { volumeId: 'ct', callback: setCtTransferFunction },
    ]);
    await viewport.setVolumes([{ volumeId }]);
    await viewport.addVolumes([{ volumeId: 'pt' }]);
    await engine.getViewport('other').setStack(imageIds);
    await csUtils.convertStackToVolumeViewport({ viewport });
    cornerstone.addVolumesToViewports(engine, [{ volumeId }], ['ct']);
  };

  const onClick = () => viewport.setStack(imageIds);
  const canStack = typeof viewport.setStack === 'function';

  function legacyLoad() {
    csUtils.genericViewportDisplaySetMetadataProvider.add(`${viewport.id}:stack`, {
      kind: 'planar',
      imageIds,
      initialImageIdIndex: 2,
    });
    viewport.setDisplaySets({ displaySetId: `${viewport.id}:stack` });
  }

  return (
    <button onClick={onClick} data-stack={String('setStack' in viewport)}>
      {String(load)} {String(legacyLoad)} {String(canStack)}
    </button>
  );
}
