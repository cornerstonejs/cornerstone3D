import { getEnabledElement } from '@cornerstonejs/core';

interface CINEToolData {
  intervalId: number | undefined;
  framesPerSecond: number;
  lastFrameTimeStamp: number | undefined;
  frameRate: number;
  frameTimeVector: number[] | undefined;
  ignoreFrameTimeVector: boolean;
  usingFrameTimeVector: boolean;
  speed: number;
  reverse: boolean;
  loop: boolean;
  data?: unknown[];
}

const state: Record<symbol, CINEToolData> = {};

function addToolState(element: HTMLDivElement, data: CINEToolData): void {
  const enabledElement = getEnabledElement(element);
  const { viewportId } = enabledElement;
  state[viewportId] = data;
}

function getToolState(element: HTMLDivElement): CINEToolData | undefined {
  const enabledElement = getEnabledElement(element);
  const { viewportId } = enabledElement;
  return state[viewportId];
}

export { addToolState, getToolState };
