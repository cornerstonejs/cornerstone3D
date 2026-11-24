import React from 'react';
import { Enums, RenderingEngine } from '@cornerstonejs/core';

export function View({ engineId }) {
  const engine = new RenderingEngine(engineId);
  const viewport = engine.getViewport('CT');
  const { SAMPLE_OLD_EVENT } = Enums.Events;

  viewport.getSampleOld();

  return <div data-event={SAMPLE_OLD_EVENT}>{viewport.getSampleOld()}</div>;
}
