import { RenderingEngine, StackViewport, utilities } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

export async function shadowed(ids: string[]) {
  const viewport = engine.getViewport('old');

  await viewport.setStack(ids);

  {
    const viewport = engine.getViewport('new');

    if (viewport instanceof StackViewport) {
      await viewport.setStack(ids);
    }
  }

  return utilities.viewportIsInStackMode(viewport);
}
