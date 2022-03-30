import { state, ToolGroupManager } from '../../store';
import ToolModes from '../../enums/ToolModes';

const { Active } = ToolModes;

/**
 * @function customCallbackHandler This is used as a generic event handler for tool events
 * on viewports. It:
 *
 * - Finds an "active" tool with:
 *    - A matching `handlerType`
 *    - A matching `customFunction` on its tool instance
 *
 * Then calls that custom function with raised event.
 *
 * @param handlerType - 'Mouse' | 'Touch' | 'MouseWheel'
 * @param customFunction - Function name that's expected to live on implementing
 *   (and event handling) active tool ex. 'doubleClickCallback'
 * @param evt
 */
export default function customCallbackHandler(
  handlerType: string,
  customFunction: string,
  evt
) {
  if (state.isInteractingWithTool) {
    return false;
  }

  const { renderingEngineId, viewportId } = evt.detail;
  const toolGroup = ToolGroupManager.getToolGroupForViewport(
    viewportId,
    renderingEngineId
  );

  if (!toolGroup) {
    return false;
  }

  // TODO: Filter tools by interaction type?
  /**
   * Iterate tool group tools until we find a tool that is:
   * - active
   * - has the custom callback function
   *
   */
  let activeTool;
  const toolGroupToolNames = Object.keys(toolGroup.toolOptions);

  for (let j = 0; j < toolGroupToolNames.length; j++) {
    const toolName = toolGroupToolNames[j];
    const tool = toolGroup.toolOptions[toolName];
    // TODO: Should be getter
    const toolInstance = toolGroup.getToolInstance(toolName);

    if (
      // TODO: Should be enum?
      tool.mode === Active &&
      // TODO: Should be implements interface?
      // Weird that we need concrete instance. Other options to filter / get callback?
      typeof toolInstance[customFunction] === 'function'
    ) {
      activeTool = toolGroup.getToolInstance(toolName);
      break;
    }
  }

  if (!activeTool) {
    return;
  }

  activeTool[customFunction](evt);
}
