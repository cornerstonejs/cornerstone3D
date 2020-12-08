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

  // TODO - This could get pretty expensive pretty quickly. We don't want to fetch the camera
  // And do world to canvas on each coord.

  // We want to produce a matrix from canvas to world for the viewport and just do a matrix operation on each handle.
  // This could still be expensive for ROIs, but we probably shouldn't have "handles" for them anyway.

  const toolsWithMoveableHandles = [];

  toolAndToolStateArray.forEach(({ tool, toolState }) => {
    for (let i = 0; i < toolState.length; i++) {
      const handle = tool.getHandleNearImagePoint(
        element,
        toolState[i],
        // TODO -> We need to change event dispatches to send array points.
        [canvasCoords.x, canvasCoords.y],
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
