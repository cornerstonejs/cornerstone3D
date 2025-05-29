import { Events } from '../../enums';
import {
  eventTarget,
  utilities,
  getRenderingEngine,
} from '@cornerstonejs/core';
import PlanarFreehandContourSegmentationTool from '../annotation/PlanarFreehandContourSegmentationTool';
import BrushTool from './BrushTool';
import type { PublicToolProps } from '../../types';

/**
 * LabelMapEditWithContourTool provides an intuitive way to edit labelmap segmentations
 * by drawing freehand contours. This tool combines the precision of contour drawing
 * with the efficiency of labelmap-based segmentation editing.
 *
 * Key Features:
 * - Extends PlanarFreehandContourSegmentationTool for contour drawing capabilities
 * - Automatically converts completed contours to labelmap modifications
 * - Supports both closed and open contour editing (configurable)
 * - Real-time viewport tracking for annotation management
 * - Integration with existing segmentation workflows
 *
 * Workflow:
 * 1. User draws a freehand contour around the area to be modified
 * 2. Tool tracks the annotation and associated viewport during drawing
 * 3. Upon completion, the contour is automatically converted to labelmap data
 * 4. Changes are applied to the active segmentation representation
 *
 * @example
 * ```typescript
 * // Add the tool to a tool group
 * toolGroup.addTool(LabelMapEditWithContourTool.toolName);
 *
 * // Set as active tool
 * toolGroup.setToolActive(LabelMapEditWithContourTool.toolName, {
 *   bindings: [{ mouseButton: MouseBindings.Primary }]
 * });
 *
 * ```
 */

class LabelMapEditWithContourTool extends PlanarFreehandContourSegmentationTool {
  static toolName = 'LabelMapEditWithContour';

  /**
   * Static map that tracks the relationship between annotations and their associated viewports.
   * This is used to maintain context when converting contours to labelmap data.
   */
  static annotationsToElementMap = new Map();

  constructor(toolProps: PublicToolProps = {}) {
    const initialProps = utilities.deepMerge(
      {
        configuration: {
          calculateStats: false,
          /**
           * Allow open contours false means to not allow a final/complete
           * annotation to be done as an open contour.  This does not mean
           * that the contour won't be open during creation.
           */
          allowOpenContours: false,
        },
      },
      toolProps
    );
    super(initialProps);
    eventTarget.addEventListener(
      Events.ANNOTATION_MODIFIED,
      this.annotationModified
    );
    eventTarget.addEventListener(
      Events.ANNOTATION_COMPLETED,
      this.annotationCompleted
    );
  }

  /**
   * Event handler called when an annotation is modified during drawing or editing.
   * This method tracks the association between annotations and their viewports,
   * which is essential for the subsequent labelmap conversion process.
   *
   * @param evt - The annotation modified event containing annotation and viewport details
   * @param evt.detail.annotation - The annotation that was modified
   * @param evt.detail.renderingEngineId - ID of the rendering engine
   * @param evt.detail.viewportId - ID of the viewport where the annotation exists
   *
   * @private
   */
  annotationModified(evt) {
    const { annotation, renderingEngineId, viewportId } = evt.detail;
    const viewport =
      getRenderingEngine(renderingEngineId)?.getViewport(viewportId);
    if (viewport) {
      // Store the viewport reference for later use in labelmap conversion
      LabelMapEditWithContourTool.annotationsToElementMap.set(
        annotation.annotationUID,
        viewport
      );
    }
  }

  /**
   * Event handler called when an annotation is completed (user finishes drawing).
   * This method triggers the conversion of the completed contour to labelmap data,
   * effectively applying the drawn contour as a segmentation modification.
   *
   * @param evt - The annotation completed event containing the finished annotation
   * @param evt.detail.annotation - The completed annotation with contour data
   *
   * @remarks
   * The method performs the following steps:
   * 1. Extracts the polyline data from the completed contour annotation
   * 2. Verifies that the annotation has an associated viewport in the tracking map
   * 3. Ensures the polyline has sufficient points (> 3) to form a valid contour
   * 4. Delegates to BrushTool.viewportContoursToLabelmap() for the actual conversion
   *
   * @private
   */
  annotationCompleted(evt) {
    const { annotation } = evt.detail;
    const { polyline } = annotation.data.contour;
    if (
      LabelMapEditWithContourTool.annotationsToElementMap.has(
        annotation.annotationUID
      )
    ) {
      const viewport = LabelMapEditWithContourTool.annotationsToElementMap.get(
        annotation.annotationUID
      );
      // Only process contours with sufficient points to form a meaningful shape
      if (polyline.length > 3) {
        BrushTool.viewportContoursToLabelmap(viewport);
      }
    }
  }
}

export default LabelMapEditWithContourTool;
