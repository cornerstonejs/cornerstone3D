import { ToolSpecificToolData, ToolAndToolStateArray, Point2 } from '../types'
import BaseAnnotationTool from '../tools/base/BaseAnnotationTool'

type ToolAndToolData = {
  tool: BaseAnnotationTool
  toolData: ToolSpecificToolData
}

/**
 * @function getMoveableAnnotationTools Filters an array of tools, returning only
 * tools with moveable handles at the mouse location.
 *
 * @param  {HTMLElement} element The element
 * @param  {ToolAndToolStateArray}   toolAndToolStateArray   The input tool array.
 * @param  {Point2}      canvasCoords  The coordinates of the mouse position.
 * @param  {string}      [interactionType=mouse]
 * @returns {ToolAndToolStateArray}            The filtered array.
 */
export default function getMoveableAnnotationTools(
  element: HTMLElement,
  toolAndToolStateArray: ToolAndToolStateArray,
  canvasCoords: Point2,
  interactionType = 'mouse'
): Array<ToolAndToolData> {
  const proximity = 6

  // TODO - This could get pretty expensive pretty quickly. We don't want to fetch the camera
  // And do world to canvas on each coord.

  // We want to produce a matrix from canvas to world for the viewport and just do a matrix operation on each handle.
  // This could still be expensive for ROIs, but we probably shouldn't have "handles" for them anyway.

  const moveableAnnotationTools = []

  toolAndToolStateArray.forEach(({ tool, toolState }) => {
    for (let i = 0; i < toolState.length; i++) {
      const near = tool.pointNearTool(
        element,
        toolState[i],
        canvasCoords,
        proximity,
        interactionType
      )

      if (near) {
        moveableAnnotationTools.push({
          tool,
          toolData: toolState[i],
        })
        break
      }
    }
  })

  return moveableAnnotationTools
}
