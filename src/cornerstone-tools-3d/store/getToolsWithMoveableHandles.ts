import {
  ToolAndToolStateArray,
  ToolSpecificToolData,
  Point2
} from '../types'

type ToolsWithMoveableHandles = {
  tool: any;
  toolData: ToolSpecificToolData;
  handle: any;
};

/**
 * @function getToolsWithMoveableHandles Filters an array of tools, returning
 * only tools with moveable handles at the mouse location.
 *
 * @public
 * @function getToolsWithMoveableHandles
 *
 * @param  {HTMLElement} element The element
 * @param  {ToolAndToolStateArray}   toolAndToolStateArray   The input tool array.
 * @param  {Point2}      canvasCoords  The coordinates of the mouse position.
 * @param  {string}      [interactionType=mouse]
 * @returns {ToolAndToolStateArray}            The filtered array.
 */
export default function getToolsWithMoveableHandles(
  element: HTMLElement,
  toolAndToolStateArray: ToolAndToolStateArray,
  canvasCoords: Point2,
  interactionType = 'mouse'
): Array<ToolsWithMoveableHandles> {
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
