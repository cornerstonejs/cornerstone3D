import { getEnabledElement, utilities } from '@cornerstonejs/core';
import type {
  Annotation,
  EventTypes,
  PublicToolProps,
  ToolProps,
  AnnotationRenderContext,
  Annotations,
} from '../../types';

import type { ContourSegmentationAnnotation } from '../../types/ContourSegmentationAnnotation';
import type {
  SplineContourSegmentationAnnotation,
  ContourAnnotation,
} from '../../types/ToolSpecificAnnotationTypes';
import type { StyleSpecifier } from '../../types/AnnotationStyle';
import { SegmentationRepresentations } from '../../enums';
import ContourBaseTool from './ContourBaseTool';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import InterpolationManager from '../../utilities/segmentation/InterpolationManager/InterpolationManager';

import {
  addContourSegmentationAnnotation,
  removeContourSegmentationAnnotation,
} from '../../utilities/contourSegmentation';
import { triggerAnnotationRenderForToolGroupIds } from '../../utilities/triggerAnnotationRenderForToolGroupIds';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';
import { getSegmentationRepresentations } from '../../stateManagement/segmentation/getSegmentationRepresentation';
import { getActiveSegmentation } from '../../stateManagement/segmentation/getActiveSegmentation';
import { getViewportIdsWithSegmentation } from '../../stateManagement/segmentation/getViewportIdsWithSegmentation';
import { getActiveSegmentIndex } from '../../stateManagement/segmentation/getActiveSegmentIndex';
import { getLockedSegmentIndices } from '../../stateManagement/segmentation/segmentLocking';
import { getSVGStyleForSegment } from '../../utilities/segmentation/getSVGStyleForSegment';
import { defaultSegmentationStateManager } from '../../stateManagement/segmentation/SegmentationStateManager';
/**
 * A base contour segmentation class responsible for rendering, registering
 * and unregister contour segmentation annotations.
 */
abstract class ContourSegmentationBaseTool extends ContourBaseTool {
  static PreviewSegmentIndex = 255;

  constructor(toolProps: PublicToolProps, defaultToolProps: ToolProps) {
    super(toolProps, defaultToolProps);
    if (this.configuration.interpolation?.enabled) {
      InterpolationManager.addTool(this.getToolName());
    }
  }

  protected onSetToolConfiguration() {
    if (this.configuration.interpolation?.enabled) {
      InterpolationManager.addTool(this.getToolName());
    } else {
      InterpolationManager.removeTool(this.getToolName());
    }
  }

  /**
   * Allow children classes inherit from this one and disable contour segmentation
   * behavior and children classes shall work like a normal contour instance which
   * is useful for "hybrid" classes such as splineROI/splineSeg, livewire/livewireSeg,
   * freehandROI/freehandSeg. When this method returns false:
   *   - contour segmentation data is not added to new annotations
   *   - annotations are not registered/unregistered as segmentations
   *   - annotation style shall not contain any segmentation style
   * @returns True if it is a contour segmentation class or false otherwise
   */
  protected isContourSegmentationTool(): boolean {
    return true;
  }

  /**
   * Creates a contour segmentation annotation
   */
  protected createAnnotation(
    evt: EventTypes.InteractionEventType
  ): ContourAnnotation {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const enabledElement = getEnabledElement(element);

    if (!enabledElement) {
      return;
    }
    const { viewport } = enabledElement;

    const contourAnnotation = super.createAnnotation(evt);

    if (!this.isContourSegmentationTool()) {
      return contourAnnotation;
    }

    const activeSeg = getActiveSegmentation(viewport.id);

    if (!activeSeg) {
      throw new Error(
        'No active segmentation detected, create one before using scissors tool'
      );
    }

    if (!activeSeg.representationData.Contour) {
      throw new Error(`A contour segmentation must be active`);
    }

    const { segmentationId } = activeSeg;
    const segmentIndex = getActiveSegmentIndex(segmentationId);

    return <ContourSegmentationAnnotation>utilities.deepMerge(
      contourAnnotation,
      {
        data: {
          segmentation: {
            segmentationId,
            segmentIndex,
          },
        },
      }
    );
  }

  protected addAnnotation(
    annotation: Annotation,
    element: HTMLDivElement
  ): string {
    const annotationUID = super.addAnnotation(annotation, element);
    if (this.isContourSegmentationTool()) {
      const contourSegAnnotation = annotation as ContourSegmentationAnnotation;

      addContourSegmentationAnnotation(contourSegAnnotation);
    }

    return annotationUID;
  }

  /**
   * Unregister the segmentation when the annotation is canceled
   * @param annotation - Contour segmentation annotation
   */
  protected cancelAnnotation(annotation: Annotation): void {
    if (this.isContourSegmentationTool()) {
      removeContourSegmentationAnnotation(
        annotation as ContourSegmentationAnnotation
      );
    }

    super.cancelAnnotation(annotation);
  }

  /**
   * Get the annotation style that may or may not be merged with segmentation
   * style so that it can be used by ROI and contour segmentation annotations
   * when rendered on a canvas or svg layer.
   *
   * Segmentation style shall be a combination of four different configurations
   * from different levels (global, toolGroup, segmentation and segment) and it
   * shall not be used when isContourSegmentationTool() is overwritten and changed
   * by a child class to return `false` when that class should work only as an ROI.
   */
  protected getAnnotationStyle(context: {
    annotation: Annotation;
    styleSpecifier: StyleSpecifier;
  }) {
    const annotationStyle = super.getAnnotationStyle(context);

    if (!this.isContourSegmentationTool()) {
      return annotationStyle;
    }

    const contourSegmentationStyle = this._getContourSegmentationStyle(context);

    return utilities.deepMerge(annotationStyle, contourSegmentationStyle);
  }

  protected renderAnnotationInstance(
    renderContext: AnnotationRenderContext
  ): boolean {
    const { annotation } = renderContext;
    const { invalidated } = annotation;
    // Render the annotation before triggering events
    const renderResult = super.renderAnnotationInstance(renderContext);
    if (invalidated && this.isContourSegmentationTool()) {
      const { segmentationId } = (<SplineContourSegmentationAnnotation>(
        annotation
      )).data.segmentation;
      triggerSegmentationDataModified(segmentationId);

      // check which other viewport is rendering the same segmentationId
      // and trigger the event for them to be able to render the segmentation
      // annotation as well

      const viewportIds = getViewportIdsWithSegmentation(segmentationId);

      const toolGroupIds = viewportIds
        .map((viewportId) => {
          const toolGroup = getToolGroupForViewport(viewportId);
          return toolGroup?.id;
        })
        .filter((toolGroupId): toolGroupId is string => toolGroupId != null);

      triggerAnnotationRenderForToolGroupIds(toolGroupIds);
    }

    return renderResult;
  }

  /**
   * @override We override this method so that the tool does not
   * render annotations that are not part of any segmentation representation
   * for the given viewport (element).
   */
  public filterInteractableAnnotationsForElement(
    element: HTMLDivElement,
    annotations: Annotations
  ): Annotations {
    if (!annotations || !annotations.length) {
      return;
    }

    const baseFilteredAnnotations =
      super.filterInteractableAnnotationsForElement(element, annotations);

    if (!baseFilteredAnnotations || !baseFilteredAnnotations.length) {
      return;
    }

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    return baseFilteredAnnotations.filter((annotation) => {
      const segmentationId = (annotation as ContourSegmentationAnnotation)?.data
        ?.segmentation?.segmentationId;

      // If there is no segmentationId, then we don't now how to filter it
      // here so we return true to keep it.
      if (!segmentationId) {
        return true;
      }

      return !!defaultSegmentationStateManager.getSegmentationRepresentation(
        viewport.id,
        {
          segmentationId,
          type: SegmentationRepresentations.Contour,
        }
      );
    });
  }

  /**
   * Return the annotation style based on global, AllSegments and perSegment
   * configurations. The style is used to render the contour segmentation
   */
  private _getContourSegmentationStyle(context: {
    annotation: Annotation;
    styleSpecifier: StyleSpecifier;
  }): Record<string, unknown> {
    const annotation = context.annotation as ContourSegmentationAnnotation;
    const { segmentationId, segmentIndex } = annotation.data.segmentation;
    const { viewportId } = context.styleSpecifier;
    const segmentationRepresentations = getSegmentationRepresentations(
      viewportId,
      { segmentationId }
    );

    if (!segmentationRepresentations?.length) {
      // return defaults if no segmentation representation is found
      return {};
    }

    let segmentationRepresentation;
    if (segmentationRepresentations.length > 1) {
      // set the segmentation representation based on the viewport
      // representations if available
      segmentationRepresentation = segmentationRepresentations.find(
        (rep) =>
          rep.segmentationId === segmentationId &&
          rep.type === SegmentationRepresentations.Contour
      );
    } else {
      segmentationRepresentation = segmentationRepresentations[0];
    }

    const { autoGenerated } = annotation;
    const segmentsLocked = getLockedSegmentIndices(segmentationId);
    const annotationLocked = segmentsLocked.includes(segmentIndex as never);

    // Todo: we should really get styles every time we render, since it is getting
    // the style for the visibility and that goes through the segment indices
    // calculation which is expensive. We should cache the styles and only update
    // them if the segmentation representation modified event is triggered.
    const { color, fillColor, lineWidth, fillOpacity, lineDash, visibility } =
      getSVGStyleForSegment({
        segmentationId,
        segmentIndex,
        viewportId,
        autoGenerated,
      });

    return {
      color,
      fillColor,
      lineWidth,
      fillOpacity,
      lineDash,
      textbox: {
        color,
      },
      visibility,
      locked: annotationLocked,
    };
  }
}

export { ContourSegmentationBaseTool as default, ContourSegmentationBaseTool };
