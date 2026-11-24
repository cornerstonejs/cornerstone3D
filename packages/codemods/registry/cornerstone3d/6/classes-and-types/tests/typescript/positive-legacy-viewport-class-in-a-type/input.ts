import { Viewport } from '@cornerstonejs/core';
import type * as cs from '@cornerstonejs/core';

export function idOf(viewport: Viewport, other: cs.Viewport): string {
  return viewport.id ?? other.id;
}
