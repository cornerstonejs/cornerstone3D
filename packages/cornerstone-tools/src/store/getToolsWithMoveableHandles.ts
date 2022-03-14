import type { Types } from '@precisionmetrics/cornerstone-render'

import { ToolAndToolStateArray, ToolSpecificToolData } from '../types'

type ToolsWithMoveableHandles = {
  tool: any
  toolData: ToolSpecificToolData
  handle: Types.Point3
}

/**
 * Filters an array of tools, returning only tools with moveable handles at the mouse location that are not locked
 *
 * @param element - The element
 * @param toolAndToolStateArray - The input tool array.
 * @param canvasCoords - The coordinates of the mouse position.
 * @param interactionType - The type of interaction (e.g. 'mouse' or 'touch')
 * @returns The filtered array.
 */
export default function getToolsWithMoveableHandles(
  element: HTMLElement,
  toolAndToolStateArray: ToolAndToolStateArray,
  canvasCoords: Types.Point2,
  interactionType = 'mouse'
): Array<ToolsWithMoveableHandles> {
  const proximity = 6
  const toolsWithMoveableHandles = []

  toolAndToolStateArray.forEach(({ tool, toolState }) => {
    for (let i = 0; i < toolState.length; i++) {
      if (toolState[i].isLocked) {
        continue
      }

      const handle = tool.getHandleNearImagePoint(
        element,
        toolState[i],
        canvasCoords,
        proximity
      )

      if (handle) {
        toolsWithMoveableHandles.push({
          tool,
          toolData: toolState[i],
          handle,
        })
        break
      }
    }
  })

  return toolsWithMoveableHandles
}
