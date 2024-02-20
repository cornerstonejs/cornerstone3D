import {
  BaseVolumeViewport,
  cache,
  getEnabledElement,
  metaData,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { vec2 } from 'gl-matrix';

import AnnotationDisplayTool from './AnnotationDisplayTool';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';
import {
  Annotation,
  Annotations,
  EventTypes,
  ToolHandle,
  InteractionTypes,
  ToolProps,
  PublicToolProps,
} from '../../types';
import { addAnnotation } from '../../stateManagement/annotation/annotationState';
import { StyleSpecifier } from '../../types/AnnotationStyle';
import { triggerAnnotationModified } from '../../stateManagement/annotation/helpers/state';

/**
 * Abstract class for tools which create and display annotations on the
 * cornerstone3D canvas. In addition, it provides a base class for segmentation
 * tools that require drawing an annotation before running the segmentation strategy
 * for instance threshold segmentation based on an area and a threshold.
 * Annotation tools make use of drawing utilities to draw SVG elements on the viewport.
 *
 * To create a new annotation tool, derive from this class and implement the
 * abstract methods.
 */
abstract class AnnotationTool extends AnnotationDisplayTool {
  /**
   * Creates a base annotation object, adding in any annotation base data provided
   */
  public static createAnnotation(...annotationBaseData): Annotation {
    let annotation: Annotation = {
      annotationUID: null as string,
      highlighted: true,
      invalidated: true,
      metadata: {
        toolName: this.toolName,
      },
      data: {
        text: '',
        handles: {
          points: new Array<Types.Point3>(),
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
        label: '',
      },
    } as unknown as Annotation;
    for (const baseData of annotationBaseData) {
      annotation = csUtils.deepMerge(annotation, baseData);
    }
    return annotation;
  }

  /**
   * Creates a new annotation for the given viewport.  This just adds the
   * viewport reference data to the metadata, and otherwise returns the
   * static class createAnnotation data.
   */
  public static createAnnotationForViewport(viewport, ...annotationBaseData) {
    return this.createAnnotation(
      { metadata: viewport.getViewReference() },
      ...annotationBaseData
    );
  }

  /**
   * Creates and adds an annotation of the given type, firing the annotation
   * modified event on the new annotation.
   * This implicitly uses the static class when you call it on the correct
   * base class.  For example, you can call the KeyImageTool.createAnnotation
   * method on KeyImageTool.toolName by calling KeyImageTool.createAndAddAnnotation
   *
   */
  public static createAndAddAnnotation(viewport, ...annotationBaseData) {
    const annotation = this.createAnnotationForViewport(
      viewport,
      ...annotationBaseData
    );
    addAnnotation(annotation, viewport.element);
    triggerAnnotationModified(annotation, viewport.element);
  }

  static toolName;
  // ===================================================================
  // Abstract Methods - Must be implemented.
  // ===================================================================

  constructor(toolProps: PublicToolProps, defaultToolProps: ToolProps) {
    super(toolProps, defaultToolProps);

    if (toolProps.configuration?.getTextLines) {
      this.configuration.getTextLines = toolProps.configuration.getTextLines;
    }

    if (toolProps.configuration?.statsCalculator) {
      this.configuration.statsCalculator =
        toolProps.configuration.statsCalculator;
    }
  }

  /**
   * @abstract addNewAnnotation Creates a new annotation based on the clicked mouse position
   *
   * @param evt - The normalized mouse event
   * @param interactionType -  The interaction type used to add the annotation.
   */
  abstract addNewAnnotation(
    evt: EventTypes.InteractionEventType,
    interactionType: InteractionTypes
  ): Annotation;

  /**
   * @abstract cancel Used to cancel the ongoing tool drawing and manipulation
   *
   */
  abstract cancel(element: HTMLDivElement);

  /**
   * handleSelectedCallback Custom callback for when a handle is selected.
   *
   * @param evt - The normalized mouse event
   * @param annotation - The annotation selected.
   * @param handle - The selected handle (either Types.Point3 in space for annotations, or TextBoxHandle object for text boxes).
   * @param interactionType - The interaction type the handle was selected with.
   */
  abstract handleSelectedCallback(
    evt: EventTypes.InteractionEventType,
    annotation: Annotation,
    handle: ToolHandle,
    interactionType: InteractionTypes
  ): void;

  /**
   * Custom callback for when an annotation is selected
   *
   * @param evt - The normalized mouse event
   * @param annotation - The `Annotation` to check.
   * @param interactionType - The interaction type used to select the tool.
   */
  abstract toolSelectedCallback(
    evt: EventTypes.InteractionEventType,
    annotation: Annotation,
    interactionType: InteractionTypes,
    canvasCoords?: Types.Point2
  ): void;

  /**
   * Returns true if the provided canvas coordinate tool is near the annotation
   *
   * @param element - The HTML element
   * @param annotation - The annotation to check
   * @param canvasCoords - The canvas coordinate to check
   * @param proximity - The minimum proximity to consider the point near
   * @param interactionType - The interaction type used to select the tool.
   *
   * @returns boolean if the point is near.
   */
  abstract isPointNearTool(
    element: HTMLDivElement,
    annotation: Annotation,
    canvasCoords: Types.Point2,
    proximity: number,
    interactionType: string
  ): boolean;

  /**
   * @virtual Event handler for Cornerstone MOUSE_MOVE event.
   *
   *
   * @param evt - The normalized mouse event
   * @param filteredAnnotations - The annotations to check for hover interactions
   * @returns True if the annotation needs to be re-drawn by the annotationRenderingEngine.
   */
  public mouseMoveCallback = (
    evt: EventTypes.MouseMoveEventType,
    filteredAnnotations?: Annotations
  ): boolean => {
    if (!filteredAnnotations) {
      return false;
    }

    const { element, currentPoints } = evt.detail;
    const canvasCoords = currentPoints.canvas;
    let annotationsNeedToBeRedrawn = false;

    for (const annotation of filteredAnnotations) {
      // Do not do anything if the annotation is locked or hidden.
      if (
        isAnnotationLocked(annotation) ||
        !isAnnotationVisible(annotation.annotationUID)
      ) {
        continue;
      }

      const { data } = annotation;
      const activateHandleIndex = data.handles
        ? data.handles.activeHandleIndex
        : undefined;

      // Perform tool specific imagePointNearToolOrHandle to determine if the mouse
      // is near the tool or its handles or its textBox.
      const near = this._imagePointNearToolOrHandle(
        element,
        annotation,
        canvasCoords,
        6 // Todo: This should come from the state
      );

      const nearToolAndNotMarkedActive = near && !annotation.highlighted;
      const notNearToolAndMarkedActive = !near && annotation.highlighted;
      if (nearToolAndNotMarkedActive || notNearToolAndMarkedActive) {
        annotation.highlighted = !annotation.highlighted;
        annotationsNeedToBeRedrawn = true;
      } else if (
        data.handles &&
        data.handles.activeHandleIndex !== activateHandleIndex
      ) {
        // Active handle index has changed, re-render.
        annotationsNeedToBeRedrawn = true;
      }
    }

    return annotationsNeedToBeRedrawn;
  };

  /**
   * It checks if the mouse click is near TextBoxHandle or AnnotationHandle itself, and
   * return either it. It prioritize TextBoxHandle over AnnotationHandle. If
   * the mouse click is not near any of the handles, it does not return anything.
   *
   * @param element - The element that the tool is attached to.
   * @param annotation - The annotation object associated with the annotation
   * @param canvasCoords - The coordinates of the mouse click on canvas
   * @param proximity - The distance from the mouse cursor to the point
   * that is considered "near".
   * @returns The handle that is closest to the cursor, or null if the cursor
   * is not near any of the handles.
   */
  getHandleNearImagePoint(
    element: HTMLDivElement,
    annotation: Annotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): ToolHandle | undefined {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { data } = annotation;
    const { points, textBox } = data.handles;

    if (textBox) {
      const { worldBoundingBox } = textBox;
      if (worldBoundingBox) {
        const canvasBoundingBox = {
          topLeft: viewport.worldToCanvas(worldBoundingBox.topLeft),
          topRight: viewport.worldToCanvas(worldBoundingBox.topRight),
          bottomLeft: viewport.worldToCanvas(worldBoundingBox.bottomLeft),
          bottomRight: viewport.worldToCanvas(worldBoundingBox.bottomRight),
        };

        if (
          canvasCoords[0] >= canvasBoundingBox.topLeft[0] &&
          canvasCoords[0] <= canvasBoundingBox.bottomRight[0] &&
          canvasCoords[1] >= canvasBoundingBox.topLeft[1] &&
          canvasCoords[1] <= canvasBoundingBox.bottomRight[1]
        ) {
          data.handles.activeHandleIndex = null;
          return textBox as ToolHandle;
        }
      }
    }

    for (let i = 0; i < points?.length; i++) {
      const point = points[i];
      const annotationCanvasCoordinate = viewport.worldToCanvas(point);

      const near =
        vec2.distance(canvasCoords, annotationCanvasCoordinate) < proximity;

      if (near === true) {
        data.handles.activeHandleIndex = i;
        return point;
      }
    }

    data.handles.activeHandleIndex = null;
  }

  /**
   * It returns the style for the text box
   * @param styleSpecifier - An object containing the specifications such as viewportId,
   * toolGroupId, toolName and annotationUID which are used to get the style if the level of specificity is
   * met (hierarchy is checked from most specific to least specific which is
   * annotationLevel -> viewportLevel -> toolGroupLevel -> default.
   * @param annotation - The annotation for the tool that is
   * currently active.
   * @returns An object of the style settings for the text box.
   */
  public getLinkedTextBoxStyle(
    specifications: StyleSpecifier,
    annotation?: Annotation
  ): Record<string, unknown> {
    // Todo: this function can be used to set different styles for different toolMode
    // for the textBox.

    return {
      visibility: this.getStyle(
        'textBoxVisibility',
        specifications,
        annotation
      ),
      fontFamily: this.getStyle(
        'textBoxFontFamily',
        specifications,
        annotation
      ),
      fontSize: this.getStyle('textBoxFontSize', specifications, annotation),
      color: this.getStyle('textBoxColor', specifications, annotation),
      shadow: this.getStyle('textBoxShadow', specifications, annotation),
      background: this.getStyle(
        'textBoxBackground',
        specifications,
        annotation
      ),
      lineWidth: this.getStyle(
        'textBoxLinkLineWidth',
        specifications,
        annotation
      ),
      lineDash: this.getStyle(
        'textBoxLinkLineDash',
        specifications,
        annotation
      ),
    };
  }

  /**
   * Returns true if the viewport is scaled to SUV units
   * @param viewport - The viewport
   * @param targetId - The annotation targetId
   * @param imageId - The annotation imageId
   * @returns
   */
  isSuvScaled(
    viewport: Types.IStackViewport | Types.IVolumeViewport,
    targetId: string,
    imageId?: string
  ): boolean {
    if (viewport instanceof BaseVolumeViewport) {
      const volumeId = targetId.split(/volumeId:|\?/)[1];
      const volume = cache.getVolume(volumeId);
      return volume.scaling?.PT !== undefined;
    }
    const scalingModule: Types.ScalingParameters | undefined =
      imageId && metaData.get('scalingModule', imageId);
    return typeof scalingModule?.suvbw === 'number';
  }

  /**
   * Get the style that will be applied to all annotations such as length, cobb
   * angle, arrow annotate, etc. when rendered on a canvas or svg layer
   */
  protected getAnnotationStyle(context: {
    annotation: Annotation;
    styleSpecifier: StyleSpecifier;
  }) {
    const { annotation, styleSpecifier } = context;
    const getStyle = (property) =>
      this.getStyle(property, styleSpecifier, annotation);
    const { annotationUID } = annotation;
    const visibility = isAnnotationVisible(annotationUID);
    const locked = isAnnotationLocked(annotation);

    const lineWidth = getStyle('lineWidth') as number;
    const lineDash = getStyle('lineDash') as string;
    const color = getStyle('color') as string;
    const shadow = getStyle('shadow') as boolean;
    const textboxStyle = this.getLinkedTextBoxStyle(styleSpecifier, annotation);

    return {
      visibility,
      locked,
      color,
      lineWidth,
      lineDash,
      lineOpacity: 1,
      fillColor: color,
      fillOpacity: 0,
      shadow,
      textbox: textboxStyle,
    };
  }

  /**
   * Returns true if the `canvasCoords` are near a handle or selectable part of the tool
   *
   * @param element - The HTML element
   * @param annotation - The annotation to check
   * @param canvasCoords - The canvas coordinates to check
   * @param proximity - The proximity to consider
   *
   * @returns If the point is near.
   */
  private _imagePointNearToolOrHandle(
    element: HTMLDivElement,
    annotation: Annotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean {
    // Based on the tool instance type, check if the point is near the tool handles
    const handleNearImagePoint = this.getHandleNearImagePoint(
      element,
      annotation,
      canvasCoords,
      proximity
    );

    if (handleNearImagePoint) {
      return true;
    }

    // If the point is not near the handles, check if the point is near the tool
    const toolNewImagePoint = this.isPointNearTool(
      element,
      annotation,
      canvasCoords,
      proximity,
      'mouse'
    );

    if (toolNewImagePoint) {
      return true;
    }
  }
}

AnnotationTool.toolName = 'AnnotationTool';
export default AnnotationTool;
