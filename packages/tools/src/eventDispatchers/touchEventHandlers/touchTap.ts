import { state } from '../../store/state';
import ToolModes from '../../enums/ToolModes';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';
import getTouchCallbackWithMouseFallback from '../shared/getTouchCallbackWithMouseFallback';
import type { EventTypes } from '../../types';

const { Active } = ToolModes;

/**
 * touchTap - Event handler for touch tap events. Fires the `touchTapCallback`
 * of the first active tool that implements it, falling back to
 * `mouseClickCallback` for tools that declare 'Touch' support.
 */
export default function touchTap(evt: EventTypes.TouchTapEventType) {
  if (state.isInteractingWithTool) {
    return;
  }

  const { renderingEngineId, viewportId } = evt.detail;
  const toolGroup = getToolGroupForViewport(viewportId, renderingEngineId);

  if (!toolGroup) {
    return;
  }

  const toolGroupToolNames = Object.keys(toolGroup.toolOptions);

  for (let j = 0; j < toolGroupToolNames.length; j++) {
    const toolName = toolGroupToolNames[j];
    const toolOptions = toolGroup.toolOptions[toolName];

    if (toolOptions.mode !== Active) {
      continue;
    }

    const toolInstance = toolGroup.getToolInstance(toolName);
    const tapCallback = getTouchCallbackWithMouseFallback(
      toolInstance,
      'touchTapCallback',
      'mouseClickCallback'
    );

    if (tapCallback) {
      tapCallback(evt);
      return;
    }
  }
}
