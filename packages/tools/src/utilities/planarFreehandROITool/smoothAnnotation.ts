import { Types } from '@cornerstonejs/core';
import { PlanarFreehandROITool } from '../../tools';
import { ToolGroupManager } from '../../store';
import { PlanarFreehandROIAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import interpolateSegmentPoints from './interpolation/interpolateSegmentPoints';

function shouldPreventInterpolation(
  enabledElement: Types.IEnabledElement,
  annotation: PlanarFreehandROIAnnotation,
  knotsRatioPercentage: number
): boolean {
  if (!annotation?.data?.polyline || knotsRatioPercentage <= 0) {
    return true;
  }

  if (!enabledElement.viewport) {
    return true;
  }

  const { renderingEngineId, viewportId, FrameOfReferenceUID } = enabledElement;
  const toolGroup = ToolGroupManager.getToolGroupForViewport(
    viewportId,
    renderingEngineId
  );

  if (annotation.metadata.FrameOfReferenceUID !== FrameOfReferenceUID) {
    return true;
  }

  if (!toolGroup) {
    return true;
  }

  const toolInstance = toolGroup.getToolInstance(annotation.metadata.toolName);

  // strategy to prevent non PlanarFreehandTool
  if (!(toolInstance instanceof PlanarFreehandROITool)) {
    return true;
  }

  return (
    toolInstance.isDrawing ||
    toolInstance.isEditingOpen ||
    toolInstance.isEditingClosed
  );
}
/**
 * Interpolates a given annotation from a given enabledElement.
 * It mutates annotation param.
 * The param knotsRatioPercentage defines the percentage of points to be considered as knots on the interpolation process.
 * Interpolation will be skipped in case: annotation is not present in enabledElement (or there is no toolGroup associated with it), related tool is being modified.
 */
export default function smoothAnnotation(
  enabledElement: Types.IEnabledElement,
  annotation: PlanarFreehandROIAnnotation,
  knotsRatioPercentage: number
): boolean {
  // prevent running while there is any tool annotation being modified
  if (
    shouldPreventInterpolation(enabledElement, annotation, knotsRatioPercentage)
  ) {
    return false;
  }

  const { viewport } = enabledElement;
  // use only 2 dimensions on interpolation (what visually matters),
  // otherwise a 3d interpolation might have a totally different output as it consider one more dimension.
  const canvasPoints = annotation.data.contour.polyline.map(
    viewport.worldToCanvas
  );
  const interpolatedCanvasPoints = <Types.Point2[]>(
    interpolateSegmentPoints(
      canvasPoints,
      0,
      canvasPoints.length,
      knotsRatioPercentage
    )
  );

  if (interpolatedCanvasPoints === canvasPoints) {
    return false;
  }

  annotation.data.contour.polyline = interpolatedCanvasPoints.map(
    viewport.canvasToWorld
  );

  return true;
}
