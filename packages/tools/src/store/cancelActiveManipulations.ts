import { ToolModes } from '../enums';
import getToolsWithModesForElement from '../utilities/getToolsWithModesForElement';
import filterToolsWithAnnotationsForElement from './filterToolsWithAnnotationsForElement';

/**
 * Cancel the current active manipulation that is being performed on the provided
 * element. It filters all the active and passive tools for the enabledElement
 * and calls cancel() method for all of them, and returns the tool that has executed its
 * cancellation (returned its annotationUID), since tools that are not being manipulated will
 * short circuit early. Note: not all tools currently implement a cancel method.
 *
 * @param element - canvas element
 * @returns annotationUID that is cancelled
 */
export default function cancelActiveManipulations(
  element: HTMLDivElement
): string | undefined {
  const tools = getToolsWithModesForElement(element, [
    ToolModes.Active,
    ToolModes.Passive,
  ]);

  const toolsWithData = filterToolsWithAnnotationsForElement(element, tools);
  for (const { tool } of toolsWithData) {
    const annotationUID = tool.cancel(element);
    if (annotationUID) {
      return annotationUID;
    }
  }
}
