import { RenderingEngine } from '@cornerstonejs/core';

export function unrelated(viewport: { setStack(a: number[]): void }) {
  viewport.setStack([1, 2]);
}

export function untyped(viewport) {
  viewport.setStack(['a']);
}

export const engine = new RenderingEngine('engine');
