import { ToolModes } from '../enums'
import getToolsWithModesForElement from '../eventDispatchers/shared/getToolsWithModesForElement'
import getToolsWithDataForElement from './getToolsWithDataForElement'

/**
 * Cancel the current active manipulation that is being performed on the provided
 * element. It filters all the active and passive tools for the enabledElement
 * and calls cancel() method for all of them, and returns the tool that has executed its
 * cancellation (returned its toolUID), since tools that are not being manipulated will
 * short circuit early
 *
 * @param element canvas element
 * @returns {string} toolUID that is cancelled
 */
export default function cancelActiveManipulations(element: HTMLElement): void {
  const tools = getToolsWithModesForElement(element, [
    ToolModes.Active,
    ToolModes.Passive,
  ])

  const toolsWithData = getToolsWithDataForElement(element, tools)
  for (const { tool } of toolsWithData) {
    const toolUID = tool.cancel(element)
    if (toolUID) {
      return toolUID
    }
  }
}
