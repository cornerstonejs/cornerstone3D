import { ToolGroupManager } from '../../store';
import { ToolModes } from '../../enums';

const { Active, Passive, Enabled } = ToolModes;

export default function filterViewportsWithToolEnabled(viewports, toolName) {
  const numViewports = viewports.length;

  const viewportsWithToolEnabled = [];

  for (let vp = 0; vp < numViewports; vp++) {
    const viewport = viewports[vp];

    const toolGroups = ToolGroupManager.getToolGroups(
      viewport.renderingEngineUID,
      viewport.sceneUID,
      viewport.uid
    );

    const hasTool = toolGroups.some(tg =>
      _toolGroupHasActiveEnabledOrPassiveTool(tg, toolName)
    );

    if (hasTool) {
      viewportsWithToolEnabled.push(viewport);
    }
  }

  return viewportsWithToolEnabled;
}

function _toolGroupHasActiveEnabledOrPassiveTool(toolGroup, toolName) {
  const { tools } = toolGroup;

  const tool = tools[toolName];

  if (!tool) {
    return false;
  }
  const toolMode = tool.mode;

  return toolMode === Active || toolMode === Passive || toolMode === Enabled;
}
