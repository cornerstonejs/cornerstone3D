import { RenderingEngine, Enums } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

/** @param {import('@cornerstonejs/core').Types.IVolumeViewport} viewport */
function presetOf(viewport) {
  return viewport.getProperties().preset;
}

export function Preset({ element }) {
  engine.enableElement({
    viewportId: 'vr',
    type: Enums.ViewportType.VOLUME_3D,
    element,
  });

  const vr = engine.getViewport('vr');

  return <span>{presetOf(vr)}</span>;
}
