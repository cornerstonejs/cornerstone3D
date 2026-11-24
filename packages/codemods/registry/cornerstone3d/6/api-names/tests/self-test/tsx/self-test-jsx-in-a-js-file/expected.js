import React from 'react';
import { Enums, RenderingEngine } from '@cornerstonejs/core';

export function View({ engineId }) {
  const engine = new RenderingEngine(engineId);
  const viewport = engine.getViewport('CT');
  const { SAMPLE_NEW_EVENT } = Enums.Events;

  viewport.getSampleNew();

  return <div data-event={SAMPLE_NEW_EVENT}>{viewport.getSampleNew()}</div>;
}
