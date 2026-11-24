import React, { useEffect } from 'react';
import { Enums, getRenderingEngine } from '@cornerstonejs/core';

export function Viewport({ engineId, displaySetId }) {
  useEffect(() => {
    const viewport = getRenderingEngine(engineId).getViewport('CT');

    viewport.setDisplaySets({ displaySetId }).then(() => viewport.render());
  }, [engineId, displaySetId]);

  return <span>{Enums.Events.NEW_IMAGE}</span>;
}
