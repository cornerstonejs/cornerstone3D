import React from 'react';
import { Enums, getRenderingEngine } from '@cornerstonejs/core';

export function AreaButton({ engineId, viewportId, area }) {
  const viewport = getRenderingEngine(engineId).getViewport(viewportId);
  const apply = () => viewport.setDisplayArea(area);
  const current = viewport.getDisplayArea();

  React.useEffect(() => {
    viewport.element.addEventListener(Enums.Events.DISPLAY_AREA_MODIFIED, apply);
  }, []);

  return <button onClick={apply}>{current?.type}</button>;
}
