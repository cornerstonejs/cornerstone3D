import React from 'react';
import { Enums, utilities, RenderingEngine } from '@cornerstonejs/core';

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

export function reset() {
  const renderingEngine = new RenderingEngine('engine');
  const stack = renderingEngine.getViewport('stack');

  stack.resetViewState();
  stack.setProperties({ invert: true });

  return <i>{stack.getZoom()}</i>;
}

export function Flip({ element }) {
  const renderingEngine = new RenderingEngine('engine');

  renderingEngine.enableElement({
    viewportId: 'flip',
    type: Enums.ViewportType.STACK,
    element,
  });

  const flip = renderingEngine.getViewport('flip');
  const { flipHorizontal } = flip.getViewState();

  flip.setViewState({ flipHorizontal: !flipHorizontal });

  return <i>{String(flipHorizontal)}</i>;
}

export function Volume3D({ element }) {
  const renderingEngine = new RenderingEngine('engine');

  renderingEngine.enableElement({
    viewportId: 'vr',
    type: Enums.ViewportType.VOLUME_3D,
    element,
  });

  const vr = renderingEngine.getViewport('vr');

  vr.setOrientation(Enums.OrientationAxis.CORONAL);

  return <canvas ref={() => vr.getCanvas()} />;
}
