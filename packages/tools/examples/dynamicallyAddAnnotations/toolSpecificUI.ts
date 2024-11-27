import { createLengthToolUI } from './lengthToolUI';
import { createProbeToolUI } from './probeToolUI';
import { createRectangleROIToolUI } from './rectangleROIToolUI';
import { createCircleROIToolUI } from './circleROIToolUI';
import { createSplineROIToolUI } from './splineROIToolUI';

export const STACK_VIEWPORT_ID = 'viewport-stack';
export const VOLUME_VIEWPORT_ID = 'viewport-volume';

export const typeToIdMap = {
  stack: STACK_VIEWPORT_ID,
  volume: VOLUME_VIEWPORT_ID,
} as const;

export const typeToStartIdMap = {
  canvas: 'canvas-start',
  image: 'image-start',
} as const;

export const typeToEndIdMap = {
  canvas: 'canvas-end',
  image: 'image-end',
} as const;

interface ToolUIConfig {
  toolName: string;
  renderingEngineId: string;
  content: HTMLElement;
  demoToolbar: HTMLElement;
}

interface ToolUI {
  forms: HTMLElement[];
}

function createToolUI(toolName: string, config: ToolUIConfig): ToolUI | null {
  let forms: HTMLElement[] = [];

  switch (toolName) {
    case 'Length':
      forms = [createLengthToolUI()];
      break;
    case 'Probe':
      forms = [createProbeToolUI()];
      break;
    case 'RectangleROI':
      forms = [createRectangleROIToolUI()];
      break;
    case 'CircleROI':
      forms = [createCircleROIToolUI()];
      break;
    case 'SplineROI':
      forms = [createSplineROIToolUI()];
      break;
    default:
      console.debug('No UI configuration for tool:', toolName);
      return null;
  }

  return { forms };
}

export { createToolUI };
