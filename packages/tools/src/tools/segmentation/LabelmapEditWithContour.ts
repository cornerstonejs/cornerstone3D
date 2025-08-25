import { Events, SegmentationRepresentations } from '../../enums';
import {
  eventTarget,
  utilities,
  getRenderingEngine,
} from '@cornerstonejs/core';
import PlanarFreehandContourSegmentationTool from '../annotation/PlanarFreehandContourSegmentationTool';
import BrushTool from './BrushTool';
import * as segmentation from '../../stateManagement/segmentation';
import type { PublicToolProps } from '../../types';
import { getSegmentationRepresentationsBySegmentationId } from '../../stateManagement/segmentation/getSegmentationRepresentation';

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
  static annotationsToViewportMap = new Map();
  private onViewportAddedToToolGroupBinded;
  private onSegmentationModifiedBinded;
  static viewportIdsChecked = [];

  /**
   * Creates a new instance of LabelMapEditWithContourTool.
   *
   * @param toolProps - Optional configuration properties for the tool
   * @param toolProps.configuration - Tool-specific configuration options
   * @param toolProps.configuration.calculateStats - Whether to calculate statistics for annotations (default: false)
   * @param toolProps.configuration.allowOpenContours - Whether to allow open contours as final annotations (default: false)
   *
   * @remarks
   * The constructor merges default configuration with provided props:
   * - calculateStats is disabled by default for performance
   * - allowOpenContours is disabled to ensure closed contours for proper labelmap conversion
   * - Open contours are still allowed during drawing, but must be closed for completion
   * - Binds event handlers for viewport and segmentation management
   */
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
    this.onViewportAddedToToolGroupBinded =
      this.onViewportAddedToToolGroup.bind(this);
    this.onSegmentationModifiedBinded = this.onSegmentationModified.bind(this);
  }

  /**
   * Initializes event listeners for annotation tracking.
   *
   * This method sets up the necessary event listeners to track annotation
   * modifications and completions. It clears any existing viewport mappings
   * and registers handlers for ANNOTATION_MODIFIED and ANNOTATION_COMPLETED events.
   *
   * @private
   */
  protected initializeListeners() {
    LabelMapEditWithContourTool.annotationsToViewportMap.clear();
    LabelMapEditWithContourTool.viewportIdsChecked = [];

    eventTarget.addEventListener(
      Events.ANNOTATION_MODIFIED,
      this.annotationModified
    );

    eventTarget.addEventListener(
      Events.ANNOTATION_COMPLETED,
      this.annotationCompleted
    );

    eventTarget.addEventListener(
      Events.TOOLGROUP_VIEWPORT_ADDED,
      this.onViewportAddedToToolGroupBinded
    );

    eventTarget.addEventListener(
      Events.SEGMENTATION_MODIFIED,
      this.onSegmentationModifiedBinded
    );
  }

  /**
   * Cleans up event listeners and resets annotation tracking.
   *
   * This method removes all event listeners that were set up during initialization
   * and clears the viewport mappings. It should be called when the tool is disabled
   * to prevent memory leaks and ensure proper cleanup.
   *
   * @private
   */
  protected cleanUpListeners() {
    LabelMapEditWithContourTool.annotationsToViewportMap.clear();
    LabelMapEditWithContourTool.viewportIdsChecked = [];

    eventTarget.removeEventListener(
      Events.ANNOTATION_MODIFIED,
      this.annotationModified
    );

    eventTarget.removeEventListener(
      Events.ANNOTATION_COMPLETED,
      this.annotationCompleted
    );

    eventTarget.removeEventListener(
      Events.TOOLGROUP_VIEWPORT_ADDED,
      this.onViewportAddedToToolGroup.bind(this)
    );

    eventTarget.removeEventListener(
      Events.SEGMENTATION_MODIFIED,
      this.onSegmentationModified.bind(this)
    );
  }

  /**
   * Checks and ensures that contour segmentation representation is available for a viewport.
   *
   * This method verifies that the active segmentation in the specified viewport has a contour
   * representation. If not present, it automatically adds one to enable contour-based editing.
   *
   * @param viewportId - The ID of the viewport to check
   * @returns Promise boolean or undefined - True if contour representation is available or was successfully added,
   *                                        false if no active segmentation exists, undefined if already checked
   *
   * @remarks
   * The method performs the following operations:
   * 1. Checks if the viewport has already been processed to avoid duplicate work
   * 2. Retrieves the active segmentation for the viewport
   * 3. If no contour representation exists, adds one with the appropriate configuration
   * 4. Marks the viewport as checked to prevent redundant processing
   *
   * @protected
   */
  protected async checkContourSegmentation(viewportId: string) {
    if (LabelMapEditWithContourTool.viewportIdsChecked.includes(viewportId)) {
      return;
    }
    const activeSeg = segmentation.getActiveSegmentation(viewportId);

    if (!activeSeg) {
      console.log('No active segmentation detected');
      return false;
    }

    const segmentationId = activeSeg.segmentationId;

    if (!activeSeg.representationData.Contour) {
      LabelMapEditWithContourTool.viewportIdsChecked.push(viewportId);
      await segmentation.addContourRepresentationToViewport(viewportId, [
        {
          segmentationId,
          type: SegmentationRepresentations.Contour,
        },
      ]);

      segmentation.addRepresentationData({
        segmentationId,
        type: SegmentationRepresentations.Contour,
        data: {},
      });
    } else {
      // if the segmentation already have a contour representation, just add it as checked
      LabelMapEditWithContourTool.viewportIdsChecked.push(viewportId);
    }

    return true;
  }

  /**
   * Event handler called when a viewport is added to the tool group.
   *
   * This method responds to viewport addition events and ensures that the newly added
   * viewport has the necessary contour segmentation representation configured.
   *
   * @param evt - The viewport added event
   * @param evt.detail.toolGroupId - The ID of the tool group that received the viewport
   * @param evt.detail.viewportId - The ID of the viewport that was added
   *
   * @remarks
   * The method only processes viewports that belong to this tool's tool group,
   * ignoring events from other tool groups to avoid unnecessary processing.
   *
   * @protected
   */
  protected onViewportAddedToToolGroup(evt) {
    const { toolGroupId, viewportId } = evt.detail;
    if (toolGroupId !== this.toolGroupId) {
      return;
    }
    this.checkContourSegmentation(viewportId);
  }

  /**
   * Event handler called when a segmentation is modified.
   *
   * This method responds to segmentation modification events and ensures that all
   * viewports associated with the modified segmentation have proper contour
   * representation configured.
   *
   * @param evt - The segmentation modified event
   * @param evt.detail.segmentationId - The ID of the segmentation that was modified
   *
   * @remarks
   * The method performs the following operations:
   * 1. Validates that a segmentation ID is provided in the event
   * 2. Retrieves all representations associated with the segmentation
   * 3. For each representation, checks and configures contour segmentation in its viewport
   * 4. This ensures consistency across all viewports displaying the same segmentation
   *
   * @protected
   */
  protected onSegmentationModified(evt) {
    const { segmentationId } = evt.detail || {};
    if (!segmentationId) {
      return;
    }
    const representations =
      getSegmentationRepresentationsBySegmentationId(segmentationId);
    if (!representations) {
      return;
    }
    representations.forEach(
      async ({ viewportId }) => await this.checkContourSegmentation(viewportId)
    );
  }

  onSetToolEnabled(): void {
    this.initializeListeners();
  }

  onSetToolActive(): void {
    this.initializeListeners();
  }

  onSetToolDisabled(): void {
    this.cleanUpListeners();
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
    if (!viewport) {
      return;
    }
    // Store the viewport reference for later use in labelmap conversion
    LabelMapEditWithContourTool.annotationsToViewportMap.set(
      annotation.annotationUID,
      viewport
    );
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
    const { polyline } = annotation.data?.contour || {};
    if (
      annotation?.metadata?.toolName !== LabelMapEditWithContourTool.toolName
    ) {
      return;
    }

    if (!polyline) {
      return;
    }

    if (
      LabelMapEditWithContourTool.annotationsToViewportMap.has(
        annotation.annotationUID
      )
    ) {
      const viewport = LabelMapEditWithContourTool.annotationsToViewportMap.get(
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
