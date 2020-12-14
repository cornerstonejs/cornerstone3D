import { ToolGroupManager } from './../../store/index';

export default function getToolsWithModesForMouseEvent(evt, modesFilter) {
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
