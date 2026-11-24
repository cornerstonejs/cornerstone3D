import type * as cs from '@cornerstonejs/core';

export function idOf(viewport: cs.BaseViewport, other: cs.BaseViewport): string {
  return viewport.id ?? other.id;
}
