import {
  utilities,
  getEnabledElement,
  VolumeViewport,
  StackViewport,
  cache,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { vec4, vec2 } from 'gl-matrix';

import BaseTool from './BaseTool';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';
import { getViewportSpecificAnnotationManager } from '../../stateManagement/annotation/annotationState';
import {
  Annotation,
  Annotations,
  EventTypes,
  ToolHandle,
  InteractionTypes,
  SVGDrawingHelper,
} from '../../types';
import triggerAnnotationRender from '../../utilities/triggerAnnotationRender';
import filterAnnotationsForDisplay from '../../utilities/planar/filterAnnotationsForDisplay';
import { getStyleProperty } from '../../stateManagement/annotation/config/helpers';
import { getState } from '../../stateManagement/annotation/config';
import { StyleSpecifier } from '../../types/AnnotationStyle';

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
abstract class AnnotationTool extends BaseTool {
  static toolName = 'AnnotationTool';
  // ===================================================================
  // Abstract Methods - Must be implemented.
  // ===================================================================

  /**
   * @abstract addNewAnnotation Creates a new annotation based on the clicked mouse position
   *
   * @param evt - The normalized mouse event
   * @param interactionType -  The interaction type used to add the annotation.
   */
  abstract addNewAnnotation(
    evt: EventTypes.MouseDownActivateEventType,
    interactionType: InteractionTypes
  ): Annotation;

  /**
   * @abstract renderAnnotation it used to draw the tool's annotation in each
   * request animation frame
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  abstract renderAnnotation(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  );

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
    evt: EventTypes.MouseDownEventType,
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
    evt: EventTypes.MouseDownEventType,
    annotation: Annotation,
    interactionType: InteractionTypes
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
   * @virtual Given the element and annotations which is an array of annotation, it
   * filters the annotations array to only include the annotation based on the viewportType.
   * If the viewport is StackViewport, it filters based on the current imageId of the viewport,
   * if the viewport is volumeViewport, it only returns those that are within the
   * same slice as the current rendered slice in the volume viewport.
   * imageId as the enabledElement.
   * @param element - The HTML element
   * @param annotations - The annotations to filter (array of annotation)
   * @returns The filtered annotations
   */
  filterInteractableAnnotationsForElement(
    element: HTMLDivElement,
    annotations: Annotations
  ): Annotations | undefined {
    if (!annotations || !annotations.length) {
      return;
    }

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    return filterAnnotationsForDisplay(viewport, annotations);
  }

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
   * On Image Calibration, take all the annotation from the AnnotationState manager,
   * and invalidate them to force them to be re-rendered and their stats to be recalculated.
   * Then use the old and new imageData (non-calibrated and calibrated) to calculate the
   * new position for the annotations in the space of the new imageData.
   *
   * @param evt - The calibration event
   *
   */
  public onImageSpacingCalibrated = (
    evt: Types.EventTypes.ImageSpacingCalibratedEvent
  ) => {
    const {
      element,
      rowScale,
      columnScale,
      imageId,
      imageData: calibratedImageData,
      worldToIndex: noneCalibratedWorldToIndex,
    } = evt.detail;

    const { viewport } = getEnabledElement(element);

    if (viewport instanceof VolumeViewport) {
      throw new Error('Cannot calibrate a volume viewport');
    }

    const calibratedIndexToWorld = calibratedImageData.getIndexToWorld();

    const imageURI = utilities.imageIdToURI(imageId);
    const stateManager = getViewportSpecificAnnotationManager(element);
    const framesOfReference = stateManager.getFramesOfReference();

    // For each frame Of Reference
    framesOfReference.forEach((frameOfReference) => {
      const frameOfReferenceSpecificAnnotations =
        stateManager.getFrameOfReferenceAnnotations(frameOfReference);

      const toolSpecificAnnotations =
        frameOfReferenceSpecificAnnotations[this.getToolName()];

      if (!toolSpecificAnnotations || !toolSpecificAnnotations.length) {
        return;
      }

      // for this specific tool
      toolSpecificAnnotations.forEach((annotation) => {
        // if the annotation is drawn on the same imageId
        const referencedImageURI = utilities.imageIdToURI(
          annotation.metadata.referencedImageId
        );

        if (referencedImageURI === imageURI) {
          // make them invalid since the image has been calibrated so that
          // we can update the cachedStats and also rendering
          annotation.invalidated = true;
          annotation.data.cachedStats = {};

          // Update annotation points to the new calibrated points. Basically,
          // using the worldToIndex function we get the index on the non-calibrated
          // image and then using the calibratedIndexToWorld function we get the
          // corresponding point on the calibrated image world.
          annotation.data.handles.points = annotation.data.handles.points.map(
            (point) => {
              const p = vec4.fromValues(...point, 1);
              const pCalibrated = vec4.fromValues(0, 0, 0, 1);
              const nonCalibratedIndexVec4 = vec4.create();
              vec4.transformMat4(
                nonCalibratedIndexVec4,
                p,
                noneCalibratedWorldToIndex
              );
              const calibratedIndex = [
                columnScale * nonCalibratedIndexVec4[0],
                rowScale * nonCalibratedIndexVec4[1],
                nonCalibratedIndexVec4[2],
              ];

              vec4.transformMat4(
                pCalibrated,
                vec4.fromValues(
                  calibratedIndex[0],
                  calibratedIndex[1],
                  calibratedIndex[2],
                  1
                ),
                calibratedIndexToWorld
              );

              return pCalibrated.slice(0, 3) as Types.Point3;
            }
          );
        }
      });

      triggerAnnotationRender(element);
    });
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
        return textBox;
      }
    }

    for (let i = 0; i < points.length; i++) {
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

  protected getReferencedImageId(
    viewport: Types.IStackViewport | Types.IVolumeViewport,
    worldPos: Types.Point3,
    viewPlaneNormal: Types.Point3,
    viewUp: Types.Point3
  ): string {
    const targetId = this.getTargetId(viewport);

    let referencedImageId;

    if (viewport instanceof StackViewport) {
      referencedImageId = targetId.split('imageId:')[1];
    } else {
      const volumeId = targetId.split('volumeId:')[1];
      const imageVolume = cache.getVolume(volumeId);

      referencedImageId = utilities.getClosestImageId(
        imageVolume,
        worldPos,
        viewPlaneNormal,
        viewUp
      );
    }

    return referencedImageId;
  }

  /**
   * It takes the property (color, lineDash, etc.) and based on the state of the
   * annotation (selected, highlighted etc.) it returns the appropriate value
   * based on the central toolStyle settings for each level of specification.
   * @param property - The name of the style property to get.
   * @param styleSpecifier - An object containing the specifications such as viewportId,
   * toolGroupId, toolName and annotationUID which are used to get the style if the level of specificity is
   * met (hierarchy is checked from most specific to least specific which is
   * annotationLevel -> viewportLevel -> toolGroupLevel -> default.
   * @param annotation - The annotation for the tool that is
   * currently active.
   * @returns The value of the property.
   */
  public getStyle(
    property: string,
    specifications: StyleSpecifier,
    annotation?: Annotation
  ): unknown {
    return getStyleProperty(
      property,
      specifications,
      getState(annotation),
      this.mode
    );
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
      fontFamily: this.getStyle(
        'textBoxFontFamily',
        specifications,
        annotation
      ),
      fontSize: this.getStyle('textBoxFontSize', specifications, annotation),
      color: this.getStyle('textBoxColor', specifications, annotation),
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

export default AnnotationTool;
