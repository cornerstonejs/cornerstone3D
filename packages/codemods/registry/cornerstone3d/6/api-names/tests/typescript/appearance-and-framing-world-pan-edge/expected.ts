import { getRenderingEngine } from '@cornerstonejs/core';

export function restore(renderingEngineId: string, pan: [number, number]) {
  const viewport = getRenderingEngine(renderingEngineId).getViewport('ct');

  viewport.setViewFraming({ ...viewport.getViewFraming(), worldPan: undefined, pan });
  viewport.setViewFraming({
    ...viewport.getViewFraming({ zoom: true }),
    ...{ rotation: 90 },
    worldPan: undefined,
    pan: viewport.getPan(),
  });
}

export function fromStore(stack: { setViewFraming(framing: object): void }) {
  const viewport = stack;

  viewport.setViewFraming({ ...stack, pan: [0, 0] });
}
