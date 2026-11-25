import React from 'react';
import { getRenderingEngine } from '@cornerstonejs/core';

export function StretchButton({ engineId, viewportId }) {
  const viewport = getRenderingEngine(engineId).getViewport(viewportId);
  const stretch = () => viewport.setViewFraming({ zoom: 1, aspectRatio: [2, 1] });
  const framing = viewport.getViewFraming({ zoom: true, aspectRatio: true });

  return <button onClick={stretch}>{framing?.zoom}</button>;
}
