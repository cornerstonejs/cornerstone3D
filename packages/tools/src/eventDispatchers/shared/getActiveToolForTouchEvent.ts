import { ToolGroupManager } from '../../store';
import { MouseBindings, ToolModes } from '../../enums';
import { EventTypes } from '../../types';

const { Active } = ToolModes;

/**
 * Iterate tool group tools until we find a tool that has a "ToolBinding"
 * that matches our TouchEvent's `buttons`. It's possible there will be no match
 * (no active tool for that touch button combination).
 *
 * @param evt - The event dispatcher touch event.
 *
 * @returns tool
 */
export default function getActiveToolForTouchEvent(
  evt: EventTypes.NormalizedTouchEventType
) {
  // Todo: we should refactor this to use getToolsWithModesForTouchEvent instead
  const { renderingEngineId, viewportId } = evt.detail;
  const touchEvent = evt.detail.event;

  const toolGroup = ToolGroupManager.getToolGroupForViewport(
    viewportId,
    renderingEngineId
  );

  if (!toolGroup) {
    return null;
  }

  const toolGroupToolNames = Object.keys(toolGroup.toolOptions);

  for (let j = 0; j < toolGroupToolNames.length; j++) {
    const toolName = toolGroupToolNames[j];
    const toolOptions = toolGroup.toolOptions[toolName];

    const correctBinding =
      toolOptions.bindings.length &&
      toolOptions.bindings.some(
        (binding) =>
          binding.numTouchPoints === Object.keys(touchEvent.touches).length ||
          binding.mouseButton === MouseBindings.Primary
        // MouseBindings.Primary is hard coded for setActiveTool by OHIF when using the
        // ./store/ToolGroupManager/ToolGroup.setToolActive API
        //
      );

    if (toolOptions.mode === Active && correctBinding) {
      return toolGroup.getToolInstance(toolName);
    }
  }
}
