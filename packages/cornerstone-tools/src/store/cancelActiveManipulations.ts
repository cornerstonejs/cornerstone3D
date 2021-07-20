import { ToolModes } from '../enums'
import getToolsWithModesForElement from '../util/getToolsWithModesForElement'
import getToolsWithDataForElement from './getToolsWithDataForElement'

/**
 * Cancel the current active manipulation that is being performed on the provided
 * element. It filters all the active and passive tools for the enabledElement
 * and calls cancel() method for all of them, and returns the tool that has executed its
 * cancellation (returned its toolDataUID), since tools that are not being manipulated will
 * short circuit early
 *
 * @param element canvas element
 * @returns {string | undefined} toolDataUID that is cancelled
 */
export default function cancelActiveManipulations(element: HTMLElement): string | undefined {
  const tools = getToolsWithModesForElement(element, [
    ToolModes.Active,
    ToolModes.Passive,
  ])

  const toolsWithData = getToolsWithDataForElement(element, tools)
  for (const { tool } of toolsWithData) {
    const toolDataUID = tool.cancel(element)
    if (toolDataUID) {
      return toolDataUID
    }
  }
}
