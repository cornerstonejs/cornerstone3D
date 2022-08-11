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
 * It annotation is interpolated it will automatically render related window.
 */
export default function interpolateAnnotation(
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

  const interpolatedPolyline = <Types.Point3[]>(
    interpolateSegmentPoints(
      annotation.data.polyline,
      0,
      annotation.data.polyline.length,
      knotsRatioPercentage
    )
  );

  if (interpolatedPolyline === annotation.data.polyline) {
    return false;
  }

  annotation.data.polyline = interpolatedPolyline;

  enabledElement.viewport.render();

  return true;
}
