import { getEnabledElement } from '@cornerstonejs/core';

const state: Record<number, any> = {};

function addToolState(element: HTMLDivElement, data): void {
  const enabledElement = getEnabledElement(element);
  const { viewportId } = enabledElement;
  state[viewportId] = data;
}

function getToolState(element: HTMLDivElement): any {
  const enabledElement = getEnabledElement(element);
  const { viewportId } = enabledElement;
  return state[viewportId];
}

export { addToolState, getToolState };
