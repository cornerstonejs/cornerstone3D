import { Events, SegmentationRepresentations } from '../../enums';
import {
  eventTarget,
  utilities,
  getRenderingEngine,
  getEnabledElement,
  type Types,
} from '@cornerstonejs/core';

import PlanarFreehandContourSegmentationTool from '../annotation/PlanarFreehandContourSegmentationTool';
import BrushTool from './BrushTool';

import * as segmentation from '../../stateManagement/segmentation';

import type { PublicToolProps } from '../../types';
import type { ContourSegmentationAnnotation } from '../../types/ContourSegmentationAnnotation';
import type { ContourSegmentationData } from '../../types/ContourTypes';
import type {
  RepresentationsData,
  Segmentation,
} from '../../types/SegmentationStateTypes';
import { getSegmentationRepresentation } from '../../stateManagement/segmentation/getSegmentationRepresentation';
import { getActiveSegmentIndex } from '../../stateManagement/segmentation/getActiveSegmentIndex';
import { isSegmentIndexLocked } from '../../stateManagement/segmentation/segmentLocking';
import { getSegmentIndexVisibility } from '../../stateManagement/segmentation/config/segmentationVisibility';

const cs3dLogger = utilities.logger.toolsLog.getLogger(
  'tools.segmentation.LabelmapEditWithContour'
);

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

  /**
   * Segmentation ids for which this tool created `representationData.Contour`.
   * The tool removes only the Contour representation data that the tool itself
   * created, so the tool never removes an empty Contour representation that the
   * application owns.
   */
  private static temporaryContourData = new Set<string>();

  /**
   * Keys of the viewport contour representations that this tool added. The key
   * is `${viewportId}\u0000${segmentationId}`. The tool removes only the
   * viewport representations that the tool itself added.
   */
  private static temporaryContourViewports = new Set<string>();

  /**
   * Builds the key of a viewport contour representation.
   *
   * @param viewportId - the id of the viewport.
   * @param segmentationId - the id of the segmentation.
   * @returns the key for `temporaryContourViewports`.
   */
  private static getViewportContourKey(
    viewportId: string,
    segmentationId: string
  ): string {
    return `${viewportId}\u0000${segmentationId}`;
  }

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

    this.initializeAddNewAnnotationHandler();
  }

  /**
   * Wraps addNewAnnotation so the temporary contour representation is ensured
   * lazily, exactly when the user starts drawing a new contour.
   *
   * The contour representation is provisioned on demand (rather than ahead of
   * time) because it is removed again after each conversion to labelmap, so it
   * must be re-created for every new annotation.
   *
   * @private
   */
  private initializeAddNewAnnotationHandler(): void {
    const originalAddNewAnnotation = this.addNewAnnotation.bind(this);

    this.addNewAnnotation = (evt) => {
      const { element } = evt.detail;
      const enabledElement = getEnabledElement(element);

      if (enabledElement) {
        const viewportId = enabledElement.viewport.id;
        const activeSeg = segmentation.getActiveSegmentation(viewportId);
        if (!activeSeg) {
          return null;
        }

        const activeSegIndex = getActiveSegmentIndex(activeSeg.segmentationId);
        if (activeSegIndex === undefined) {
          return null;
        }

        const isSegmentLocked = isSegmentIndexLocked(
          activeSeg.segmentationId,
          activeSegIndex
        );
        const isSegmentHidden = !getSegmentIndexVisibility(
          viewportId,
          {
            segmentationId: activeSeg.segmentationId,
            type: SegmentationRepresentations.Labelmap,
          },
          activeSegIndex
        );

        if (isSegmentLocked || isSegmentHidden) {
          return null;
        }

        void this.checkContourSegmentation(viewportId, activeSeg);
      }

      return originalAddNewAnnotation(evt);
    };
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

    eventTarget.removeEventListener(
      Events.ANNOTATION_MODIFIED,
      this.annotationModified
    );

    eventTarget.removeEventListener(
      Events.ANNOTATION_COMPLETED,
      this.annotationCompleted
    );
  }

  /**
   * Checks and ensures that contour segmentation representation is available for a viewport.
   *
   * This method verifies that the active segmentation in the specified viewport has a contour
   * representation. If not present, it automatically adds one to enable contour-based editing.
   *
   * @param viewportId - The ID of the viewport to check
   * @param activeSeg - Active segmentation in the viewport
   * @returns Promise resolving to true when a contour representation is available
   *          (or was successfully added), false if no active segmentation exists
   *
   * @remarks
   * The method performs the following operations:
   * 1. Retrieves the active segmentation for the viewport
   * 2. Adds empty contour representation data when the segmentation has none
   * 3. Adds the contour representation to the viewport when it is not present yet
   *
   * The checks are driven off live state, so the method is idempotent and safe
   * to call on every new annotation, including after a previous temporary
   * representation has been cleaned up.
   *
   * @protected
   */
  protected async checkContourSegmentation(
    viewportId: string,
    activeSeg: Segmentation
  ) {
    if (!activeSeg) {
      cs3dLogger.info('No active segmentation detected');
      return false;
    }

    const segmentationId = activeSeg.segmentationId;

    if (!activeSeg.representationData.Contour) {
      segmentation.addRepresentationData({
        segmentationId,
        type: SegmentationRepresentations.Contour,
        data: {},
      });
      LabelMapEditWithContourTool.temporaryContourData.add(segmentationId);
    }

    const hasViewportContour = getSegmentationRepresentation(viewportId, {
      segmentationId,
      type: SegmentationRepresentations.Contour,
    });

    if (!hasViewportContour) {
      LabelMapEditWithContourTool.temporaryContourViewports.add(
        LabelMapEditWithContourTool.getViewportContourKey(
          viewportId,
          segmentationId
        )
      );
      await segmentation.addContourRepresentationToViewport(viewportId, [
        {
          segmentationId,
          type: SegmentationRepresentations.Contour,
        },
      ]);
    }

    return true;
  }

  /**
   * Overrides the annotation memo to prevent recording contour edits in
   * the annotation undo/redo history.
   *
   * Contours drawn by this tool are transient intermediates that are converted to
   * labelmap data on completion. Undo/redo for those changes is handled by the
   * labelmap memo created during conversion, not by annotation memos
   *
   * @param element - The viewport element where the annotation is being drawn.
   * @param annotation - The contour annotation being edited.
   * @param options - Optional memo configuration passed by the draw loop.
   */
  protected createMemo(element, annotation, options?): void {
    return;
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

    // Keep only the annotations of this tool. `applyContourStroke` creates the
    // merged result annotations with the name of the freehand contour tool, and
    // those annotations never reach `annotationCompleted`. Without this test the
    // map keeps a viewport reference for every annotation of the application.
    if (
      annotation?.metadata?.toolName !== LabelMapEditWithContourTool.toolName
    ) {
      return;
    }

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
   * Reports if a Contour representation still holds an annotation.
   *
   * `addContourSegmentationAnnotation` puts an `annotationUIDsMap` on the
   * Contour representation data, and the map stays there after the conversion
   * removes the annotations. An empty map, and a map that holds no segment, are
   * both equal to no contour content.
   *
   * @param contourData - the Contour representation data of the segmentation.
   * @returns true when the Contour representation still holds content.
   */
  private static hasContourContent(
    contourData: ContourSegmentationData
  ): boolean {
    if (contourData.geometryIds?.length) {
      return true;
    }

    const { annotationUIDsMap } = contourData;

    if (!annotationUIDsMap) {
      return false;
    }

    for (const annotationUIDs of annotationUIDsMap.values()) {
      if (annotationUIDs.size) {
        return true;
      }
    }

    return false;
  }

  /**
   * Removes the temporary Contour representation that this tool created for
   * contour-to-labelmap editing.
   *
   * The tool removes the viewport representation only when the tool added that
   * viewport representation. The tool removes `representationData.Contour` only
   * when the tool created that data. An application that owns an empty Contour
   * representation keeps that representation.
   *
   * The tool also keeps the representation when the Contour representation
   * still holds an annotation, because that annotation belongs to the
   * application.
   *
   * @param viewport - The viewport containing the temporary Contour representation.
   * @param annotation - The annotation used to determine the segmentation.
   *
   * @private
   */
  private static cleanupTemporaryContourRepresentation(
    viewport: Types.IViewport,
    annotation
  ): void {
    const segmentationId = annotation?.data?.segmentation?.segmentationId;

    if (!segmentationId) {
      return;
    }

    const viewportKey = LabelMapEditWithContourTool.getViewportContourKey(
      viewport.id,
      segmentationId
    );
    const ownsViewportContour =
      LabelMapEditWithContourTool.temporaryContourViewports.has(viewportKey);
    const ownsContourData =
      LabelMapEditWithContourTool.temporaryContourData.has(segmentationId);

    if (!ownsViewportContour && !ownsContourData) {
      return;
    }

    const segmentationState =
      segmentation.state.getSegmentation(segmentationId);

    const contourData = segmentationState?.representationData?.Contour;

    if (
      contourData &&
      LabelMapEditWithContourTool.hasContourContent(contourData)
    ) {
      return;
    }

    if (ownsViewportContour) {
      LabelMapEditWithContourTool.temporaryContourViewports.delete(viewportKey);
      segmentation.removeContourRepresentation(viewport.id, segmentationId);
    }

    if (!ownsContourData || !segmentationState) {
      return;
    }

    LabelMapEditWithContourTool.temporaryContourData.delete(segmentationId);

    const representationData = utilities.deepClone(
      segmentationState.representationData
    ) as RepresentationsData;

    delete representationData.Contour;

    segmentation.updateSegmentations(
      [
        {
          segmentationId,
          payload: {
            representationData,
          },
        },
      ],
      true
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
   * 3. Ensures the polyline has sufficient points (>= 3) to form a valid contour
   * 4. Delegates to BrushTool.viewportContoursToLabelmap() for the actual conversion
   *
   * The `ANNOTATION_COMPLETED` listener of `init` runs before this handler, so
   * `applyContourStroke` already removed this annotation and put the merged
   * result annotations in the annotation state. The conversion therefore selects
   * the contours by segment, and not by the annotation that the event carries.
   *
   * @private
   */
  annotationCompleted(evt) {
    const { annotation } = evt.detail;

    if (
      annotation?.metadata?.toolName !== LabelMapEditWithContourTool.toolName
    ) {
      return;
    }

    const annotationUID = annotation.annotationUID;
    const viewport =
      LabelMapEditWithContourTool.annotationsToViewportMap.get(annotationUID);

    if (!viewport) {
      return;
    }

    // The conversion runs only for a contour that `applyContourStroke` keeps.
    // `applyContourStroke` drops a polyline of less than 3 points, so this test
    // uses the same limit. The clean up below still runs for the dropped stroke,
    // because the temporary representation exists in both cases.
    const polyline = annotation.data?.contour?.polyline;
    const segmentationData = (annotation as ContourSegmentationAnnotation).data
      ?.segmentation;

    if (polyline?.length >= 3 && segmentationData) {
      BrushTool.viewportContoursToLabelmap(viewport, {
        // `applyContourStroke` merged the stroke into the contours of the same
        // segment on the same plane, and it names each result annotation after
        // the freehand contour tool. The segment of the stroke is therefore the
        // only reliable test for the result of the stroke.
        annotationFilter: (annotations) =>
          annotations.filter((candidate) => {
            const candidateSegmentation = (
              candidate as ContourSegmentationAnnotation
            ).data?.segmentation;

            return (
              candidateSegmentation?.segmentationId ===
                segmentationData.segmentationId &&
              candidateSegmentation?.segmentIndex ===
                segmentationData.segmentIndex
            );
          }),
      });
    }

    LabelMapEditWithContourTool.cleanupTemporaryContourRepresentation(
      viewport,
      annotation
    );

    LabelMapEditWithContourTool.annotationsToViewportMap.delete(annotationUID);
  }
}

export default LabelMapEditWithContourTool;
