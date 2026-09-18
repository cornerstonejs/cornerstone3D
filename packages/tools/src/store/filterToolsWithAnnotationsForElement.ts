import { getAnnotations } from '../stateManagement/annotation/annotationState';
import type { ToolAnnotationsPair } from '../types/InternalToolTypes';
import type AnnotationTool from '../tools/base/AnnotationTool';
import type BaseTool from '../tools/base/BaseTool';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'store.filterToolsWithAnnotationsForElement'
);

/**
 * Filters an array of tools, returning only tools which have annotation.
 *
 * @param element - The cornerstone3D enabled element.
 * @param tools - The array of tools to check.
 *
 * @returns The array of tools with their found annotations.
 */
export default function filterToolsWithAnnotationsForElement(
  element: HTMLDivElement,
  tools: AnnotationTool[]
): ToolAnnotationsPair[] {
  const result = [];
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];

    if (!tool) {
      cs3dLogger.warn('undefined tool in filterToolsWithAnnotationsForElement');
      continue;
    }

    let annotations = getAnnotations(
      (tool.constructor as typeof BaseTool).toolName,
      element
    );

    if (!annotations?.length) {
      continue;
    }

    if (typeof tool.filterInteractableAnnotationsForElement === 'function') {
      // If the tool has a annotations filter (e.g. with in-plane-annotations-only filtering), use it.
      annotations = tool.filterInteractableAnnotationsForElement(
        element,
        annotations
      );
    }

    if (annotations?.length > 0) {
      result.push({ tool, annotations });
    }
  }

  return result;
}
