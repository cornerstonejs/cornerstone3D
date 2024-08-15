import { getEnabledElement, utilities } from '@cornerstonejs/core';
import type {
  Annotation,
  EventTypes,
  PublicToolProps,
  ToolProps,
  AnnotationRenderContext,
} from '../../types';
import {
  config as segmentationConfig,
  state as segmentationState,
  segmentLocking,
  segmentIndex as segmentIndexController,
  activeSegmentation,
} from '../../stateManagement/segmentation';
import type { ContourSegmentationAnnotation } from '../../types/ContourSegmentationAnnotation';
import type { SplineContourSegmentationAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import type { StyleSpecifier } from '../../types/AnnotationStyle';
import { SegmentationRepresentations } from '../../enums';
import ContourBaseTool from './ContourBaseTool';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import { InterpolationManager } from '../../utilities/contours/interpolation';
import {
  addContourSegmentationAnnotation,
  removeContourSegmentationAnnotation,
} from '../../utilities/contourSegmentation';
import { triggerAnnotationRenderForToolGroupIds } from '../../utilities';
import {
  getActiveSegmentationRepresentation,
  getSegmentationRepresentationsForSegmentation,
  getSegmentationRepresentations,
  getViewportIdsWithSegmentation,
} from '../../stateManagement/segmentation/segmentationState';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';

/**
 * A base contour segmentation class responsible for rendering, registering
 * and unregister contour segmentation annotations.
 */
abstract class ContourSegmentationBaseTool extends ContourBaseTool {
  constructor(toolProps: PublicToolProps, defaultToolProps: ToolProps) {
    super(toolProps, defaultToolProps);
    if (this.configuration.interpolation?.enabled) {
      InterpolationManager.addTool(this.getToolName());
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

  protected createAnnotation(evt: EventTypes.InteractionEventType): Annotation {
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

    const activeSeg = activeSegmentation.getActiveSegmentationRepresentation(
      viewport.id
    );

    if (!activeSeg) {
      throw new Error(
        'No active segmentation detected, create one before using scissors tool'
      );
    }

    const { type: segmentationType } = activeSeg;

    if (segmentationType !== SegmentationRepresentations.Contour) {
      throw new Error(`A contour segmentation must be active`);
    }

    const { segmentationId } = activeSeg;
    const segmentIndex =
      segmentIndexController.getActiveSegmentIndex(segmentationId);

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

      const toolGroupIds = viewportIds.map((viewportId) => {
        const toolGroup = getToolGroupForViewport(viewportId);
        return toolGroup.id;
      });

      triggerAnnotationRenderForToolGroupIds(toolGroupIds);
    }

    return renderResult;
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
    const segmentation = segmentationState.getSegmentation(segmentationId);
    const segmentationRepresentations =
      getSegmentationRepresentationsForSegmentation(segmentationId);

    if (!segmentationRepresentations?.length) {
      // return defaults if no segmentation representation is found
      return {};
    }

    const allUIDs = segmentationRepresentations.map(
      (rep) => rep.segmentationRepresentationUID
    );

    let segmentationRepresentation;
    if (segmentationRepresentations.length > 1) {
      const viewportReps = getSegmentationRepresentations(
        context.styleSpecifier.viewportId
      );

      // set the segmentation representation based on the viewport
      // representations if available
      segmentationRepresentation = viewportReps.find(
        (rep) =>
          rep.segmentationId === segmentationId &&
          allUIDs.includes(rep.segmentationRepresentationUID)
      );
    } else {
      segmentationRepresentation = segmentationRepresentations[0];
    }

    const { segmentationRepresentationUID } = segmentationRepresentation;
    const { autoGenerated } = annotation;
    const segmentsLocked =
      segmentLocking.getLockedSegmentIndices(segmentationId);
    const annotationLocked = segmentsLocked.includes(segmentIndex as never);

    // Todo: we should really get styles every time we render, since it is getting
    // the style for the visibility and that goes through the segment indices
    // calculation which is expensive. We should cache the styles and only update
    // them if the segmentation representation modified event is triggered.

    const segmentColor = segmentationConfig.color.getSegmentIndexColor(
      segmentationRepresentationUID,
      segmentIndex
    );

    const viewportId = context.styleSpecifier.viewportId;

    const segmentationVisible =
      segmentationConfig.visibility.getSegmentationRepresentationVisibility(
        viewportId,
        segmentationRepresentationUID
      );

    const globalConfig = segmentationConfig.getGlobalConfig();

    const getSegmentationRepresentationConfig =
      segmentationConfig.getSegmentationRepresentationConfig(
        segmentationRepresentationUID
      );

    const segmentConfig = segmentationConfig.getSegmentIndexConfig(
      segmentationRepresentationUID,
      segmentIndex
    );

    const segmentVisible =
      segmentationConfig.visibility.getSegmentIndexVisibility(
        viewportId,
        segmentationRepresentationUID,
        segmentIndex
      );

    const activeSegRep = getActiveSegmentationRepresentation(viewportId);

    const isActive =
      activeSegRep.segmentationRepresentationUID ===
      segmentationRepresentationUID;

    // Merge the configurations from different levels based on its precedence
    const mergedConfig = Object.assign(
      {},
      globalConfig?.representations?.CONTOUR ?? {},
      getSegmentationRepresentationConfig?.CONTOUR ?? {},
      segmentConfig?.CONTOUR ?? {}
    );

    let lineWidth = 1;
    let lineDash = undefined;
    let lineOpacity = 1;
    let fillOpacity = 0;

    if (autoGenerated) {
      lineWidth = mergedConfig.outlineWidthAutoGenerated ?? lineWidth;
      lineDash = mergedConfig.outlineDashAutoGenerated ?? lineDash;
      lineOpacity = mergedConfig.outlineOpacity ?? lineOpacity;
      fillOpacity = mergedConfig.fillAlphaAutoGenerated ?? fillOpacity;
    } else if (isActive) {
      lineWidth = mergedConfig.outlineWidthActive ?? lineWidth;
      lineDash = mergedConfig.outlineDashActive ?? lineDash;
      lineOpacity = mergedConfig.outlineOpacity ?? lineOpacity;
      fillOpacity = mergedConfig.fillAlpha ?? fillOpacity;
    } else {
      lineWidth = mergedConfig.outlineWidthInactive ?? lineWidth;
      lineDash = mergedConfig.outlineDashInactive ?? lineDash;
      lineOpacity = mergedConfig.outlineOpacityInactive ?? lineOpacity;
      fillOpacity = mergedConfig.fillAlphaInactive ?? fillOpacity;
    }

    // Change the line thickness when the mouse is over the contour segment
    if (segmentation.activeSegmentIndex === segmentIndex) {
      lineWidth += mergedConfig.activeSegmentOutlineWidthDelta;
    }

    lineWidth = mergedConfig.renderOutline ? lineWidth : 0;
    fillOpacity = mergedConfig.renderFill ? fillOpacity : 0;

    const color = `rgba(${segmentColor[0]}, ${segmentColor[1]}, ${segmentColor[2]}, ${lineOpacity})`;
    const fillColor = `rgb(${segmentColor[0]}, ${segmentColor[1]}, ${segmentColor[2]})`;

    return {
      color,
      fillColor,
      lineWidth,
      fillOpacity,
      lineDash,
      textbox: {
        color,
      },
      visibility: segmentationVisible && segmentVisible,
      locked: annotationLocked,
    };
  }
}

export { ContourSegmentationBaseTool as default, ContourSegmentationBaseTool };
