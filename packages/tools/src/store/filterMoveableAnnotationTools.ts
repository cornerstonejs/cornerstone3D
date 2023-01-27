import type { Types } from '@cornerstonejs/core';

import {
  ToolAnnotationPair,
  ToolAnnotationsPair,
} from '../types/InternalToolTypes';

/**
 * Filters an array of tools with annotations, returning the first annotation
 * for each tool that is moveable and at the mouse location. It results in
 * one annotation per tool.
 *
 *
 * @param element - The HTML element
 * @param ToolAndAnnotations - The input tool array.
 * @param canvasCoords - The coordinates of the mouse position.
 * @param interactionType - The type of interaction that is taking place.
 * @returns The filtered array containing ToolAndAnnotation
 */
export default function filterMoveableAnnotationTools(
  element: HTMLDivElement,
  ToolAndAnnotations: ToolAnnotationsPair[],
  canvasCoords: Types.Point2,
  interactionType = 'mouse'
): ToolAnnotationPair[] {
  const proximity = interactionType === 'touch' ? 36 : 6;

  // TODO - This could get pretty expensive pretty quickly. We don't want to fetch the camera
  // And do world to canvas on each coord.

  // We want to produce a matrix from canvas to world for the viewport and just do a matrix operation on each handle.
  // This could still be expensive for ROIs, but we probably shouldn't have "handles" for them anyway.

  const moveableAnnotationTools = [];

  ToolAndAnnotations.forEach(({ tool, annotations }) => {
    for (const annotation of annotations) {
      if (annotation.isLocked || !annotation.isVisible) {
        continue;
      }

      const near = tool.isPointNearTool(
        element,
        annotation,
        canvasCoords,
        proximity,
        interactionType
      );

      if (near) {
        moveableAnnotationTools.push({
          tool,
          annotation,
        });
        break;
      }
    }
  });

  return moveableAnnotationTools;
}
