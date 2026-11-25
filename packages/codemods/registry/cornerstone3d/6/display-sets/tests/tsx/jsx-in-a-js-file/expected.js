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
    viewport.setStack(imageIds, 2);
  }

  return (
    <button onClick={onClick} data-stack={String('setStack' in viewport)}>
      {String(load)} {String(legacyLoad)} {String(canStack)}
    </button>
  );
}

export async function run(element, imageIds) {
  const renderingEngine = new cornerstone.RenderingEngine('engine');
  const stack = renderingEngine.getViewport('stack');

  const displaySetId = JSON.stringify([stack.renderingEngineId, stack.id, imageIds[0]]);
  cornerstone.displaySetRegistry.add(displaySetId, {
    imageIds,
  });
  await stack.setDisplaySets({ displaySetId, options: { initialImageIdIndex: 0 } });
}
