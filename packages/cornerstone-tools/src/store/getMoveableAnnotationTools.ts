import type { Types } from '@precisionmetrics/cornerstone-render'

import { ToolAndToolDataArray, ToolAndToolStateArray } from '../types'

/**
 * Filters an array of tools, returning only tools with moveable handles at the mouse location.
 *
 * @param element - The HTML element
 * @param toolAndToolStateArray - The input tool array.
 * @param canvasCoords - The coordinates of the mouse position.
 * @param interactionType - The type of interaction that is taking place.
 * @returns The filtered array containing toolAndToolData
 */
export default function getMoveableAnnotationTools(
  element: HTMLElement,
  toolAndToolStateArray: ToolAndToolStateArray,
  canvasCoords: Types.Point2,
  interactionType = 'mouse'
): ToolAndToolDataArray {
  const proximity = 6

  // TODO - This could get pretty expensive pretty quickly. We don't want to fetch the camera
  // And do world to canvas on each coord.

  // We want to produce a matrix from canvas to world for the viewport and just do a matrix operation on each handle.
  // This could still be expensive for ROIs, but we probably shouldn't have "handles" for them anyway.

  const moveableAnnotationTools = []

  toolAndToolStateArray.forEach(({ tool, toolState }) => {
    for (let i = 0; i < toolState.length; i++) {
      if (toolState[i].isLocked) {
        continue
      }

      const near = tool.isPointNearTool(
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
