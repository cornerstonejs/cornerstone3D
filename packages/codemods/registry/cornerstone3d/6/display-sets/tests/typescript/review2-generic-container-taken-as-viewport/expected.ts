import { utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

interface History<T> {
  setStack(ids: string[]): void;
  last?: T;
}

export function undo(h: History<Types.IViewport>) {
  h.setStack(['undo']);
}

export function list(entries: Array<Types.IStackViewport>) {
  entries[0].setStack(['first']);
}

export function cast(value: unknown) {
  (value as History<Types.IStackViewport>).setStack(['cast']);
}

export function optional(viewport: Types.IStackViewport | undefined) {
  const displaySetId = JSON.stringify([viewport.renderingEngineId, viewport.id, 'optional']);
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    kind: 'planar',
    imageIds: ['optional'],
    initialImageIdIndex: 0,
  });
  viewport!.setDisplaySets({ displaySetId });
}
