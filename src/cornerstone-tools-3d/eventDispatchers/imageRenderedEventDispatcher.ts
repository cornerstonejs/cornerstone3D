import { state, ToolGroupManager } from '../store/index';
import { Events as RenderingEngineEvents } from '../../index';
import { ToolBindings, ToolModes } from './../enums';

const { Active, Passive } = ToolModes;

const onImageRendered = function(evt) {
  const { renderingEngineUID, sceneUID, viewportUID } = evt.detail;
  const toolGroups = ToolGroupManager.getToolGroups(
    renderingEngineUID,
    sceneUID,
    viewportUID
  );

  let activeAndPassiveTools = [];

  for (let i = 0; i < toolGroups.length; i++) {
    const toolGroup = toolGroups[i];
    const toolGroupToolNames = Object.keys(toolGroup.tools);

    for (let j = 0; j < toolGroupToolNames.length; j++) {
      const toolName = toolGroupToolNames[j];
      const tool = toolGroup.tools[toolName];

      if (tool.mode === Passive || tool.mode === Active) {
        const toolInstance = toolGroup._tools[toolName];
        activeAndPassiveTools.push(toolInstance);
      }
    }
  }

  activeAndPassiveTools.forEach(tool => {
    if (tool.renderToolData) {
      tool.renderToolData(evt);
    }
  });
};

const enable = function(element) {
  element.addEventListener(
    RenderingEngineEvents.IMAGE_RENDERED,
    onImageRendered
  );
};

const disable = function(element) {
  element.removeEventListener(
    RenderingEngineEvents.IMAGE_RENDERED,
    onImageRendered
  );
};

export default {
  enable,
  disable,
};
