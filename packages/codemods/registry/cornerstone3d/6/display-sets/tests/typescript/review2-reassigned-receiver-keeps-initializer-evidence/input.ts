import { RenderingEngine } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

const customPlayer = {
  setStack(ids: string[]) {
    console.log(ids);
  },
};

export async function reassignedViewport() {
  let viewport = engine.getViewport('old');
  viewport = customPlayer as unknown as typeof viewport;
  await viewport.setStack(['custom-1']);
}

export async function reassignedEngine(other: unknown) {
  let renderingEngine = new RenderingEngine('second');
  renderingEngine = other as RenderingEngine;
  const viewport = renderingEngine.getViewport('a');
  await viewport.setStack(['custom-2']);
}

export async function typedLet() {
  let viewport: Types.IStackViewport = engine.getViewport('typed');
  viewport = customPlayer as unknown as typeof viewport;
  await viewport.setStack(['custom-3']);
}

export async function assignedParameter(viewport: Types.IStackViewport) {
  viewport = customPlayer as unknown as typeof viewport;
  await viewport.setStack(['custom-4']);
}

export async function constBinding() {
  const viewport = engine.getViewport('kept');
  await viewport.setStack(['kept-1']);
}
