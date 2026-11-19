import { Enums } from '@cornerstonejs/core';

export function kind(viewport: { type: string }) {
  if (viewport.type === Enums.ViewportType.STACK) {
    return 'stack';
  }

  return viewport.type === 'orthographic' ? 'volume' : 'other';
}
