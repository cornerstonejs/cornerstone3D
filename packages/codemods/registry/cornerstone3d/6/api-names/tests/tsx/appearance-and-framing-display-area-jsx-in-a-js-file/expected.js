import React from 'react';
import { Enums, getRenderingEngine } from '@cornerstonejs/core';

export function AreaButton({ engineId, viewportId, area }) {
  const viewport = getRenderingEngine(engineId).getViewport(viewportId);
  const apply = () => viewport.setViewState({ displayArea: area });
  const current = viewport.getViewState().displayArea;

  React.useEffect(() => {
    viewport.element.addEventListener(Enums.Events.DISPLAY_AREA_MODIFIED, apply);
  }, []);

  return <button onClick={apply}>{current?.type}</button>;
}
