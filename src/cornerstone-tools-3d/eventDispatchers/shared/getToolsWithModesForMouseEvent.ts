import { ToolGroupManager } from './../../store/index';
import { ToolModes } from '../../enums';

type ModesFilter = Array<ToolModes>;

/**
 * @function getToolsWithModesForMouseEvent Given the event and a filter of modes,
 * find all the tools on the element that are in one of the specified modes.
 * @param {Event} evt The normalized mouseDown event.
 * @param modesFilter An array of entries from the `ToolModes` enum.
 */
export default function getToolsWithModesForMouseEvent(
  evt,
  modesFilter: ModesFilter
) {
  const { renderingEngineUID, sceneUID, viewportUID } = evt.detail;
  const toolGroups = ToolGroupManager.getToolGroups(
    renderingEngineUID,
    sceneUID,
    viewportUID
  );

  const enabledTools = [];

  for (let i = 0; i < toolGroups.length; i++) {
    const toolGroup = toolGroups[i];
    const toolGroupToolNames = Object.keys(toolGroup.tools);

    for (let j = 0; j < toolGroupToolNames.length; j++) {
      const toolName = toolGroupToolNames[j];
      const tool = toolGroup.tools[toolName];

      if (modesFilter.includes(tool.mode)) {
        const toolInstance = toolGroup._tools[toolName];
        enabledTools.push(toolInstance);
      }
    }
  }

  return enabledTools;
}
