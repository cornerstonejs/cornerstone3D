import { ToolGroupManager } from '../../store';
import { MouseBindings, ToolModes } from '../../enums';
import { EventTypes } from '../../types';
import getMouseModifier from './getMouseModifier';

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

  const numTouchPoints = Object.keys(touchEvent.touches).length;

  // If any keyboard modifier key is also pressed
  const modifierKey = getMouseModifier(touchEvent);

  for (let j = 0; j < toolGroupToolNames.length; j++) {
    const toolName = toolGroupToolNames[j];
    const toolOptions = toolGroup.toolOptions[toolName];

    const correctBinding =
      toolOptions.bindings.length &&
      /**
       * TODO: setActiveTool treats MouseBindings.Primary in a special way
       * which is analgous to numTouchPoints === 1 as the primary interaction
       * for touch based applications. The ToolGroup set active and get active
       * logic should be updated to account for numTouchPoints === 1
       */
      toolOptions.bindings.some(
        (binding) =>
          (binding.numTouchPoints === numTouchPoints ||
            (numTouchPoints === 1 &&
              binding.mouseButton === MouseBindings.Primary)) &&
          binding.modifierKey === modifierKey
      );

    if (toolOptions.mode === Active && correctBinding) {
      return toolGroup.getToolInstance(toolName);
    }
  }
}
