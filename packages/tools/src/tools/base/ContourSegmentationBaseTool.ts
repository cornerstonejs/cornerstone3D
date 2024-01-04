import type { Types } from '@cornerstonejs/core';
import {
  addAnnotation,
  getAnnotations,
} from '../../stateManagement/annotation/annotationState';
import {
  Annotation,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
} from '../../types';
import {
  config as segmentationConfig,
  state as segmentationState,
  segmentLocking,
  segmentIndex as segmentIndexController,
  activeSegmentation,
} from '../../stateManagement/segmentation';
import {
  SegmentationAnnotation,
  SegmentationAnnotationData,
} from '../../types/SegmentationAnnotation';
import { drawPolyline as drawPolylineSvg } from '../../drawingSvg';
import { StyleSpecifier } from '../../types/AnnotationStyle';
import { SegmentationRepresentations } from '../../enums';
import AnnotationTool from './AnnotationTool';

abstract class ContourSegmentationBaseTool extends AnnotationTool {
  constructor(toolProps: PublicToolProps, defaultToolProps: ToolProps) {
    super(toolProps, defaultToolProps);
  }

  /**
   * it is used to draw the annotation in each request animation frame. It
   * calculates the updated cached statistics if data is invalidated and cache it.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  public renderAnnotation(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean {
    let renderStatus = false;
    const { viewport } = enabledElement;
    const { element } = viewport;

    // If rendering engine has been destroyed while rendering
    if (!viewport.getRenderingEngine()) {
      console.warn('Rendering Engine has been destroyed');
      return renderStatus;
    }

    let annotations = getAnnotations(this.getToolName(), element);

    if (!annotations?.length) {
      return renderStatus;
    }

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    if (!annotations?.length) {
      return renderStatus;
    }

    const targetId = this.getTargetId(viewport);
    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as Annotation;

      styleSpecifier.annotationUID = annotation.annotationUID;

      const annotationStyle = this.getAnnotationStyle({
        annotation,
        styleSpecifier,
      });

      const annotationRendered = this.renderAnnotationInstance({
        enabledElement,
        targetId,
        annotation,
        annotationStyle,
        svgDrawingHelper,
      });

      renderStatus ||= annotationRendered;
    }

    return renderStatus;
  }

  /**
   * Check if an annotation is a contour segmentation annotation.
   *
   * This is helpful on classes that can work in a hybrid way as a normal
   * annotation tool or as a segmentation tool such as spline ROI tool. In that
   * the segmentation must not be registered/unregistered as a contour
   * segmentation annotation.
   *
   * @param annotation - Annotation
   * @returns True if the annotation is a contour segmentation annotation or false otherwise
   */
  protected isSegmentationAnnotation(
    annotation: Annotation
  ): annotation is SegmentationAnnotation {
    return (
      (annotation as SegmentationAnnotation).segmentationData !== undefined
    );
  }

  /**
   * Return the segmentation data that needs to be merged with annotation data
   * in any child class to compose the annotation data.
   * @returns Annotation segmentation data
   */
  protected getSegmentationAnnotationData(): SegmentationAnnotationData {
    const { toolGroupId } = this;
    const activeSegmentationRepresentation =
      activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);

    if (!activeSegmentationRepresentation) {
      throw new Error(
        'No active segmentation detected, create one before using scissors tool'
      );
    }

    const { type: segmentationType } = activeSegmentationRepresentation;

    if (segmentationType !== SegmentationRepresentations.Contour) {
      throw new Error(`A contour segmentation must be active`);
    }

    const { segmentationId, segmentationRepresentationUID } =
      activeSegmentationRepresentation;
    const segmentIndex =
      segmentIndexController.getActiveSegmentIndex(segmentationId);

    return {
      segmentationData: {
        segmentationId,
        segmentIndex,
        segmentationRepresentationUID,
      },
    };
  }

  protected addAnnotation(annotation: Annotation, element: HTMLDivElement) {
    const isSegmentationAnnotation = this.isSegmentationAnnotation(annotation);

    // annotationUID is available only after calling addAnnotation
    addAnnotation(annotation, element);

    if (isSegmentationAnnotation) {
      this._registerContourSegmentationAnnotation(annotation);
    }
  }

  /**
   * Unregister the segmentation when the annotation is canceled
   * @param annotation - Contour segmentation annotation
   */
  protected cancelAnnotation(annotation: Annotation): void {
    const isSegmentationAnnotation = this.isSegmentationAnnotation(annotation);

    if (isSegmentationAnnotation) {
      this._unregisterContourSegmentationAnnotation(annotation);
    }
  }

  /**
   * Return the annotation style based on global, toolGroup, segmentation
   * and segment segmentation configurations.
   */
  protected getAnnotationStyle(context: {
    annotation: Annotation;
    styleSpecifier: StyleSpecifier;
  }): Record<string, any> {
    const annotation = context.annotation as SegmentationAnnotation;
    const { toolGroupId } = this;
    const { segmentationRepresentationUID, segmentationId, segmentIndex } =
      annotation.segmentationData;
    const segmentationRepresentation =
      segmentationState.getSegmentationRepresentationByUID(
        toolGroupId,
        segmentationRepresentationUID
      );

    const { active } = segmentationRepresentation;
    const segmentsLocked = segmentLocking.getLockedSegments(segmentationId);
    const annotationLocked = segmentsLocked.includes(segmentIndex as never);

    const segmentColor = segmentationConfig.color.getColorForSegmentIndex(
      toolGroupId,
      segmentationRepresentationUID,
      segmentIndex
    );

    const segmentationVisible =
      segmentationConfig.visibility.getSegmentationVisibility(
        toolGroupId,
        segmentationRepresentationUID
      );

    const globalConfig = segmentationConfig.getGlobalConfig();

    const toolGroupConfig =
      segmentationConfig.getToolGroupSpecificConfig(toolGroupId);

    const segmentationRepresentationConfig =
      segmentationConfig.getSegmentationRepresentationSpecificConfig(
        toolGroupId,
        segmentationRepresentationUID
      );

    const segmentConfig = segmentationConfig.getSegmentSpecificConfig(
      toolGroupId,
      segmentationRepresentationUID,
      segmentIndex
    );

    const segmentVisible = segmentationConfig.visibility.getSegmentVisibility(
      toolGroupId,
      segmentationRepresentationUID,
      segmentIndex
    );

    // Merge the configurations from different levels based on its precedence
    const mergedConfig = Object.assign(
      {},
      globalConfig?.representations?.CONTOUR ?? {},
      toolGroupConfig?.representations?.CONTOUR ?? {},
      segmentationRepresentationConfig?.CONTOUR ?? {},
      segmentConfig?.CONTOUR ?? {}
    );

    let lineWidth = 1;
    let lineDash = undefined;
    let lineOpacity = 1;
    let fillOpacity = 0;

    if (active) {
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

  /**
   * Get polyline points in canvas space
   * @param annotation - Contour annotation
   * @returns Polyline points in canvas space
   */
  protected abstract getPolylinePoints(annotation: Annotation): Types.Point2[];

  /**
   * Render the contour segmentation annotation
   */
  protected renderAnnotationInstance(renderContext: {
    enabledElement: Types.IEnabledElement;
    targetId: string;
    annotation: Annotation;
    annotationStyle: Record<string, any>;
    svgDrawingHelper: SVGDrawingHelper;
  }): boolean {
    const { annotation, annotationStyle, svgDrawingHelper } = renderContext;
    const { annotationUID } = annotation;
    const polylineCanvas = this.getPolylinePoints(annotation);
    const { lineWidth, lineDash, color, fillColor, fillOpacity } =
      annotationStyle;

    drawPolylineSvg(
      svgDrawingHelper,
      annotationUID,
      'lineSegments',
      polylineCanvas,
      {
        color,
        lineDash,
        lineWidth: Math.max(0.1, lineWidth),
        fillColor: fillColor,
        fillOpacity,
      }
    );

    return true;
  }

  private _registerContourSegmentationAnnotation(
    annotation: SegmentationAnnotation
  ) {
    const { segmentationId, segmentIndex } = annotation.segmentationData;
    const segmentation = segmentationState.getSegmentation(segmentationId);
    const { annotationUIDsMap } = segmentation.representationData.CONTOUR;

    let annotationsUIDsSet = annotationUIDsMap.get(segmentIndex);

    if (!annotationsUIDsSet) {
      annotationsUIDsSet = new Set();
      annotationUIDsMap.set(segmentIndex, annotationsUIDsSet);
    }

    annotationsUIDsSet.add(annotation.annotationUID);
  }

  private _unregisterContourSegmentationAnnotation(
    annotation: SegmentationAnnotation
  ) {
    const { segmentationId, segmentIndex } = annotation.segmentationData;
    const segmentation = segmentationState.getSegmentation(segmentationId);
    const { annotationUIDsMap } = segmentation.representationData.CONTOUR;
    const annotationsUIDsSet = annotationUIDsMap.get(segmentIndex);

    annotationsUIDsSet.delete(annotation.annotationUID);

    // Delete segmentIndex Set if there is no more annotations
    if (!annotationsUIDsSet.size) {
      annotationUIDsMap.delete(segmentIndex);
    }
  }
}

export { ContourSegmentationBaseTool as default, ContourSegmentationBaseTool };
