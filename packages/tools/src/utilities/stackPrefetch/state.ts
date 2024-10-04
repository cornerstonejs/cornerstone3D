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

function getToolState(element: HTMLDivElement): StackPrefetchData {
  const enabledElement = getEnabledElement(element);
  const { viewportId } = enabledElement;
  return state[viewportId];
}

export { addToolState, getToolState };
