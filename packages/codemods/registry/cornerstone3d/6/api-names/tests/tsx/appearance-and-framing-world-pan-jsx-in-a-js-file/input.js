import React from 'react';
import { getRenderingEngine } from '@cornerstonejs/core';

export function CentreButton({ renderingEngineId, viewportId }) {
  const centre = () => {
    const viewport =
      getRenderingEngine(renderingEngineId).getViewport(viewportId);

    viewport.setViewFraming({ ...viewport.getViewFraming(), pan: [0, 0] });
  };

  return <button onClick={centre}>Centre</button>;
}
