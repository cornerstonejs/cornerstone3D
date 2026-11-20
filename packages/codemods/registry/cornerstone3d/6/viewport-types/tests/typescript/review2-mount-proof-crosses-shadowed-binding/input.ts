import { Enums, RenderingEngine } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

export async function shadowed(ids: string[]) {
  const viewport = engine.getViewport('old');

  await viewport.setStack(ids);

  {
    const viewport = engine.getViewport('new');

    if (viewport.type === Enums.ViewportType.STACK) {
      await viewport.setStack(ids);
    }
  }

  return viewport.type === Enums.ViewportType.STACK;
}

export async function otherFunction(ids: string[]) {
  const viewport = engine.getViewport('outer');

  await viewport.setStack(ids);

  return () => viewport.type === Enums.ViewportType.ORTHOGRAPHIC;
}

export async function reassigned(ids: string[]) {
  let viewport = engine.getViewport('first');

  await viewport.setStack(ids);
  viewport = engine.getViewport('second');

  return viewport.type === Enums.ViewportType.STACK;
}

export async function callReceiver(ids: string[]) {
  await engine.getViewport('call').setStack(ids);

  return engine.getViewport('call').type === Enums.ViewportType.STACK;
}
