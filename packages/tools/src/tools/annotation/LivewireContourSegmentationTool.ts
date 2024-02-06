import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';

import LivewireContourTool from './LivewireContourTool';
import { LivewirePath } from '../../utilities/livewire/LiveWirePath';
import { triggerAnnotationModified } from '../../stateManagement/annotation/helpers/state';
import { ChangeTypes } from '../../enums';
import type { ContourSegmentationAnnotation } from '../../types';
import { drawPolyline as drawPolylineSvg } from '../../drawingSvg';

class LivewireContourSegmentationTool extends LivewireContourTool {
  static toolName;

  /**
   * Updates the interpolated annotations with the currently displayed image data,
   * performing hte livewire on the image data as generated.
   * Note - this function is only called for interpolated livewire SEGMENTATION
   * objects, and will return immediately otherwise.
   *
   * The work for the interpolation is performed in a microtask, enabling this
   * method to return quickly for faster render speeds, but ensuring that the
   * annotation data isn't updated before the changes are performed.  The removes
   * some irritating flickering on navigation.
   */
  public updateInterpolatedAnnotation(
    annotation: ContourSegmentationAnnotation,
    enabledElement: Types.IEnabledElement
  ) {
    // The interpolation sources is used as a flag here - a true livewire
    // behaviour would be to perform a livewire between the two planes
    // closest to this plane for each point, and use that handle.  That is
    // oblique, however, which is not currently supported.
    if (
      this.editData ||
      !annotation.invalidated ||
      !annotation.data.handles.interpolationSources
    ) {
      return;
    }
    annotation.data.contour.originalPolyline = annotation.data.contour.polyline;

    // See docs above for why this is a microtask
    queueMicrotask(() => {
      if (!annotation.data.handles.interpolationSources) {
        return;
      }
      const { points } = annotation.data.handles;

      const { element } = enabledElement.viewport;
      this.setupBaseEditData(points[0], element, annotation);
      const { length: count } = points;
      const { scissors } = this;
      const { nearestEdge, repeatInterpolation } =
        this.configuration.interpolation;
      annotation.data.handles.originalPoints = points;
      const { worldToSlice, sliceToWorld } = this.editData;
      const handleSmoothing = [];

      // New path generation - go through the handles and regenerate the polyline
      if (nearestEdge) {
        let lastPoint = worldToSlice(points[points.length - 1]);
        // Nearest edge handling
        points.forEach((point, hIndex) => {
          const testPoint = worldToSlice(point);
          lastPoint = testPoint;
          handleSmoothing.push(testPoint);

          // Fill the costs buffer and then find the minimum cost
          // This is a little too aggressive about pulling the line in
          scissors.startSearch(lastPoint);
          scissors.findPathToPoint(testPoint);
          // Fill the costs for a point a bit further along by searching for a
          // point further along.
          scissors.findPathToPoint(
            worldToSlice(points[(hIndex + 3) % points.length])
          );
          const minPoint = scissors.findMinNearby(testPoint, nearestEdge);
          if (!csUtils.isEqual(testPoint, minPoint)) {
            handleSmoothing[hIndex] = minPoint;
            lastPoint = minPoint;
            points[hIndex] = sliceToWorld(minPoint);
          }
        });
      }

      // Regenerate the updated data based on the updated handles
      const acceptedPath = new LivewirePath();
      for (let i = 0; i < count; i++) {
        scissors.startSearch(worldToSlice(points[i]));
        const path = scissors.findPathToPoint(
          worldToSlice(points[(i + 1) % count])
        );
        acceptedPath.addPoints(path);
      }

      // Now, update the rendering
      this.updateAnnotation(acceptedPath);
      this.scissors = null;
      this.scissorsRight = null;
      this.editData = null;
      annotation.data.handles.interpolationSources = null;

      if (repeatInterpolation) {
        triggerAnnotationModified(
          annotation,
          enabledElement.viewport.element,
          ChangeTypes.InterpolationUpdated
        );
      }
    });
  }

  /**
   * Adds the update to the interpolated annotaiton on render an instance,
   * but otherwise just calls the parent render annotation instance.
   */
  protected renderAnnotationInstance(renderContext): boolean {
    const { enabledElement, svgDrawingHelper } = renderContext;
    const annotation =
      renderContext.annotation as ContourSegmentationAnnotation;
    const { annotationUID } = annotation;
    const { viewport } = enabledElement;
    const { worldToCanvas } = viewport;
    const { showInterpolationPolyline } =
      this.configuration.interpolation || {};

    this.updateInterpolatedAnnotation?.(annotation, enabledElement);
    const { originalPolyline } = annotation.data.contour;

    const rendered = super.renderAnnotationInstance(renderContext);

    if (
      showInterpolationPolyline &&
      originalPolyline &&
      annotation.autoGenerated
    ) {
      const polylineCanvasPoints = originalPolyline.map(
        worldToCanvas
      ) as Types.Point2[];
      polylineCanvasPoints.push(polylineCanvasPoints[0]);
      drawPolylineSvg(
        svgDrawingHelper,
        annotationUID,
        'interpolationContour-0',
        polylineCanvasPoints,
        {
          color: '#70ffff',
          lineWidth: 1,
          fillOpacity: 0,
        }
      );
    }

    return rendered;
  }

  protected isContourSegmentationTool(): boolean {
    // Re-enable contour segmentation behavior disabled by LivewireContourTool
    return true;
  }
}

LivewireContourSegmentationTool.toolName = 'LivewireContourSegmentationTool';
export default LivewireContourSegmentationTool;
