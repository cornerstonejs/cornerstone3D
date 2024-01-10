import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  addAnnotation,
  getAnnotations,
} from '../../stateManagement/annotation/annotationState';
import {
  Annotation,
  ContourAnnotation,
  EventTypes,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
} from '../../types';
import { drawPolyline as drawPolylineSvg } from '../../drawingSvg';
import { StyleSpecifier } from '../../types/AnnotationStyle';
import AnnotationTool from './AnnotationTool';

/**
 * A contour base class responsible for rendering contour instances such as
 * spline, freehand and livewire.
 */
abstract class ContourBaseTool extends AnnotationTool {
  constructor(toolProps: PublicToolProps, defaultToolProps: ToolProps) {
    super(toolProps, defaultToolProps);
  }

  /**
   * it is used to draw the annotation in each request animation frame. It
   * calculates the updated cached statistics if data is invalidated and cache it.
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

      if (!annotationStyle.visibility) {
        continue;
      }

      const annotationRendered = this.renderAnnotationInstance({
        enabledElement,
        targetId,
        annotation,
        annotationStyle,
        svgDrawingHelper,
      });

      renderStatus ||= annotationRendered;
      annotation.invalidated = false;
    }

    return renderStatus;
  }

  protected createAnnotation(evt: EventTypes.InteractionEventType): Annotation {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const { world: worldPos } = currentPoints;

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    return <ContourAnnotation>{
      highlighted: true,
      invalidated: true,
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID,
        referencedImageId,
      },
      data: {
        handles: {
          points: [],
          activeHandleIndex: null,
          textBox: {
            hasMoved: false,
            worldPosition: <Types.Point3>[0, 0, 0],
            worldBoundingBox: {
              topLeft: <Types.Point3>[0, 0, 0],
              topRight: <Types.Point3>[0, 0, 0],
              bottomLeft: <Types.Point3>[0, 0, 0],
              bottomRight: <Types.Point3>[0, 0, 0],
            },
          },
        },
        contour: {
          polyline: [],
          closed: false,
        },
      },
    };
  }

  /**
   * Add the annotation to the annotation manager.
   * @param annotation - Contour annotation that is being added
   * @param element - HTMLDivElement
   */
  protected addAnnotation(
    annotation: Annotation,
    element: HTMLDivElement
  ): string {
    // Just to give a chance for child classes to override it
    return addAnnotation(annotation, element);
  }

  /**
   * Cancel an annotation when drawing.
   * @param annotation - Contour annotation that is being added
   * @param element - HTMLDivElement
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected cancelAnnotation(annotation: Annotation): void {
    // noop method just to give a chance for child classes to override it
  }

  /**
   * Get polyline points in world space.
   * Just to give a chance for child classes to override it.
   * @param annotation - Contour annotation
   * @returns Polyline points in world space
   */
  protected getPolylinePoints(annotation: ContourAnnotation): Types.Point3[] {
    // Attenttion: `contour.polyline` is the new way to store a polyline but it
    // may be undefined because it was `data.polyline` before (fallback)
    return annotation.data.contour?.polyline ?? annotation.data.polyline;
  }

  /**
   * Render a contour segmentation instance
   */
  protected renderAnnotationInstance(renderContext: {
    enabledElement: Types.IEnabledElement;
    targetId: string;
    annotation: Annotation;
    annotationStyle: Record<string, any>;
    svgDrawingHelper: SVGDrawingHelper;
  }): boolean {
    const { enabledElement, annotationStyle, svgDrawingHelper } = renderContext;
    const annotation = renderContext.annotation as ContourAnnotation;
    const { annotationUID } = annotation;
    const { viewport } = enabledElement;
    const { worldToCanvas } = viewport;
    const polylineCanvasPoints = this.getPolylinePoints(annotation).map(
      (point) => worldToCanvas(point)
    );
    const { lineWidth, lineDash, color, fillColor, fillOpacity } =
      annotationStyle;

    drawPolylineSvg(
      svgDrawingHelper,
      annotationUID,
      'contourPolyline',
      polylineCanvasPoints,
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
}

export { ContourBaseTool as default, ContourBaseTool };
