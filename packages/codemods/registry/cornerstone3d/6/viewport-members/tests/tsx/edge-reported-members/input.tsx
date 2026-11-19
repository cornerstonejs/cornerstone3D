import React from 'react';
import { utilities } from '@cornerstonejs/core';

export function Controls({ engine, displaySetId, imageIds }) {
  const viewport = engine.getViewport('ct');

  const apply = () => {
    viewport.setProperties({ voiRange: { lower: 0, upper: 1 } }, 'volume');
    viewport.setProperties({ isComputedVOI: true });
    viewport.setProperties(savedProperties);
    viewport.resetCamera({ resetToCenter: false });
    viewport.setCamera({ parallelScale: 10 });
    viewport.setCamera({ flipHorizontal: true });
    viewport.isDisabled = true;

    return [viewport.getCamera(), viewport.getProperties(), viewport.scaling];
  };

  const remount = async () => {
    viewport.setProperties({ invert: true });
    await viewport.setDisplaySets({ displaySetId });
  };

  const supports = utilities.viewportSupportsStackCompatibility(viewport);

  return (
    <button onClick={apply} onDoubleClick={remount}>
      {String(supports)} {imageIds.length}
    </button>
  );
}
