import { createAngleToolUI } from './angleToolUI';
import { createArrowAnnotateToolUI } from './arrowAnnotateToolUI';
import { createEllipseROIToolUI } from './ellipticalROIToolUI';
import { createLengthToolUI } from './lengthToolUI';
import { createProbeToolUI } from './probeToolUI';
import { createRectangleROIToolUI } from './rectangleROIToolUI';
import { createCircleROIToolUI } from './circleROIToolUI';
import { createSplineROIToolUI } from './splineROIToolUI';

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
    case 'Angle':
      forms = [createAngleToolUI()];
      break;
    case 'ArrowAnnotate':
      forms = [createArrowAnnotateToolUI()];
      break;
    case 'EllipticalROI':
      forms = [createEllipseROIToolUI()];
      break;
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
