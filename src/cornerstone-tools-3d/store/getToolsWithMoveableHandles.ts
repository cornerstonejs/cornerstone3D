import { getToolState } from '../stateManagement/toolState';
import { getEnabledElement } from '../../index';
/**
 * Filters an array of tools, returning only tools with moveable handles at the
 * mouse location.
 *
 * @public
 * @function getToolsWithMoveableHandles
 *
 * @param  {HTMLElement} element The element
 * @param  {Object[]}    tools   The input tool array.
 * @param  {Object}      coords  The coordinates of the mouse position.
 * @param  {string}      [interactionType=mouse]
 * @returns {Object[]}            The filtered array.
 */
export default function(
  element,
  toolAndToolStateArray,
  canvasCoords,
  interactionType = 'mouse'
) {
  const proximity = 6;

  if (toolAndToolStateArray.length === 0) {
    return [];
  }

  const toolsWithMoveableHandles = [];

  toolAndToolStateArray.forEach(({ tool, toolState }) => {
    for (let i = 0; i < toolState.length; i++) {
      const handle = tool.getHandleNearImagePoint(
        element,
        toolState[i],
        canvasCoords,
        proximity
      );

      if (handle) {
        toolsWithMoveableHandles.push({
          tool,
          toolData: toolState[i],
          handle,
        });
        break;
      }
    }
  });

  return toolsWithMoveableHandles;
}
