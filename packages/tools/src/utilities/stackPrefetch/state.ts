import { getEnabledElement } from '@cornerstonejs/core';

// Add this interface near the top of the file
export interface StackPrefetchData {
  indicesToRequest: number[];
  currentImageIdIndex: number;
  stackCount: number;
  enabled: boolean;
  direction: number;
  cacheFill?: boolean;
  stats: {
    start: number;
    imageIds: Map<string, number>;
    decodeTimeInMS: number;
    loadTimeInMS: number;
    totalBytes: number;
    initialTime?: number;
    initialSize?: number;
    fillTime?: number;
    fillSize?: number;
  };
}

const state: Record<number, StackPrefetchData> = {};

function addToolState(element: HTMLDivElement, data): void {
  const enabledElement = getEnabledElement(element);
  const { viewportId } = enabledElement;
  state[viewportId] = data;
}

/**
 * The prefetch state of the viewport of an element, none when the element is
 * not enabled (any more).
 */
function getToolState(element: HTMLDivElement): StackPrefetchData {
  const viewportId = getEnabledElement(element)?.viewportId;

  return viewportId === undefined ? undefined : state[viewportId];
}

/**
 * Removes the prefetch state of the viewport of an element, so a viewport
 * that comes later with the same id starts without it.
 */
function removeToolState(element: HTMLDivElement): void {
  const viewportId = getEnabledElement(element)?.viewportId;

  if (viewportId !== undefined) {
    delete state[viewportId];
  }
}

export { addToolState, getToolState, removeToolState };
