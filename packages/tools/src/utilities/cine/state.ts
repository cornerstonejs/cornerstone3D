import { getEnabledElement } from '@cornerstonejs/core';
import { CINETypes } from '../../types';

const state: Record<string, CINETypes.ToolData> = {};

function addToolState(element: HTMLDivElement, data: CINETypes.ToolData): void {
  const enabledElement = getEnabledElement(element);
  const { viewportId } = enabledElement;
  state[viewportId] = data;
}

function getToolState(element: HTMLDivElement): CINETypes.ToolData | undefined {
  const enabledElement = getEnabledElement(element);
  const { viewportId } = enabledElement;
  return state[viewportId];
}

function getToolStateByViewportId(
  viewportId: string
): CINETypes.ToolData | undefined {
  return state[viewportId];
}

export { addToolState, getToolState, getToolStateByViewportId };
