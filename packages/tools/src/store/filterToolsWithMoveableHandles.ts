import type { Types } from '@cornerstonejs/core';

import {
  ToolAnnotationsPair,
  ToolsWithMoveableHandles,
} from '../types/InternalToolTypes';

/**
 * Filters an array of tools, returning only tools with moveable handles at the mouse location that are not locked
 *
 * @param element - The element
 * @param ToolAndAnnotations - The input tool array.
 * @param canvasCoords - The coordinates of the mouse position.
 * @param interactionType - The type of interaction (e.g. 'mouse' or 'touch')
 * @returns The filtered array.
 */
export default function filterToolsWithMoveableHandles(
  element: HTMLDivElement,
  ToolAndAnnotations: ToolAnnotationsPair[],
  canvasCoords: Types.Point2,
  interactionType = 'mouse'
): ToolsWithMoveableHandles[] {
  const proximity = interactionType === 'touch' ? 36 : 6;
  const toolsWithMoveableHandles = [];

  ToolAndAnnotations.forEach(({ tool, annotations }) => {
    for (const annotation of annotations) {
      if (annotation.isLocked || !annotation.isVisible) {
        continue;
      }

      const handle = tool.getHandleNearImagePoint(
        element,
        annotation,
        canvasCoords,
        proximity
      );

      if (handle) {
        toolsWithMoveableHandles.push({
          tool,
          annotation,
          handle,
        });
        break;
      }
    }
  });

  return toolsWithMoveableHandles;
}
