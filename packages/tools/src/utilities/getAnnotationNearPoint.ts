import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { AnnotationTool, BaseTool } from '../tools';
import { Annotation } from '../types';
import { getAnnotations } from '../stateManagement/annotation/annotationState';
import * as ToolGroupManager from '../store/ToolGroupManager';

/**
 * Get the annotation that is close to the provided canvas point, it will return
 * the first annotation that is found.
 *
 * @param element - The element to search for an annotation on.
 * @param canvasPoint - The canvasPoint on the page where the user clicked.
 * @param proximity - The distance from the canvasPoint to the annotation.
 * @returns The annotation for the element
 */
function getAnnotationNearPoint(
  element: HTMLDivElement,
  canvasPoint: Types.Point2,
  proximity = 5
): Annotation | null {
  // Todo: this function should return closest annotation, BUT, we are not using
  // the function anywhere.
  const enabledElement = getEnabledElement(element);
  if (!enabledElement) {
    throw new Error('getAnnotationNearPoint: enabledElement not found');
  }

  return getAnnotationNearPointOnEnabledElement(
    enabledElement,
    canvasPoint,
    proximity
  );
}

/**
 * "Find the annotation near the point on the enabled element." it will return the
 * first annotation that is found.
 *
 * @param enabledElement - The element that is currently active.
 * @param point - The point to search near.
 * @param proximity - The distance from the point that the annotation must
 * be within.
 * @returns A Annotation object.
 */
function getAnnotationNearPointOnEnabledElement(
  enabledElement: Types.IEnabledElement,
  point: Types.Point2,
  proximity: number
): Annotation | null {
  // Todo: this function should return closest annotation, BUT, we are not using
  // the function anywhere.
  const { renderingEngineId, viewportId } = enabledElement;
  const toolGroup = ToolGroupManager.getToolGroupForViewport(
    viewportId,
    renderingEngineId
  );

  if (!toolGroup) {
    return null;
  }

  const { _toolInstances: tools } = toolGroup;
  for (const name in tools) {
    const found = findAnnotationNearPointByTool(
      tools[name],
      enabledElement,
      point,
      proximity
    );
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * For the provided toolClass, it will find the annotation that is near the point,
 * it will return the first annotation that is found.
 *
 * @param tool - AnnotationTool
 * @param enabledElement - The element that is currently active.
 * @param point - The point in the image where the user clicked.
 * @param proximity - The distance from the point that the tool must be
 * within to be considered "near" the point.
 * @returns The annotation object that is being returned is the annotation object that
 * is being used in the tool.
 */
function findAnnotationNearPointByTool(
  tool: AnnotationTool,
  enabledElement: Types.IEnabledElement,
  point: Types.Point2,
  proximity: number
): Annotation | null {
  // Todo: this function does not return closest annotation. It just returns
  // the first annotation that is found in the proximity. BUT, we are not using
  // the function anywhere.
  const annotations = getAnnotations(
    enabledElement.viewport.element,
    (tool.constructor as typeof BaseTool).toolName
  );
  const currentId = enabledElement.viewport?.getCurrentImageId?.();
  if (annotations?.length) {
    const { element } = enabledElement.viewport;
    for (const annotation of annotations) {
      const referencedImageId = annotation.metadata?.referencedImageId;
      if (
        (currentId && referencedImageId && currentId !== referencedImageId) ||
        !tool.isPointNearTool
      ) {
        continue;
      }

      if (
        tool.isPointNearTool(element, annotation, point, proximity, '') ||
        tool.getHandleNearImagePoint(element, annotation, point, proximity)
      ) {
        return annotation;
      }
    }
  }
  return null;
}

export { getAnnotationNearPoint, getAnnotationNearPointOnEnabledElement };
