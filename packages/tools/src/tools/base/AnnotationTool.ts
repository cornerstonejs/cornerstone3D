import {
  BaseVolumeViewport,
  cache,
  getEnabledElement,
  metaData,
  utilities as csUtils,
  StackViewport,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { vec2 } from 'gl-matrix';

import AnnotationDisplayTool from './AnnotationDisplayTool';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';
import type {
  Annotation,
  Annotations,
  EventTypes,
  ToolHandle,
  InteractionTypes,
  ToolProps,
  PublicToolProps,
  ContourSegmentationAnnotation,
  ContourAnnotationData,
} from '../../types';
import {
  addAnnotation,
  removeAnnotation,
  getAnnotation,
} from '../../stateManagement/annotation/annotationState';
import type {
  AnnotationStyle,
  StyleSpecifier,
} from '../../types/AnnotationStyle';
import { triggerAnnotationModified } from '../../stateManagement/annotation/helpers/state';
import { drawLinkedTextBox } from '../../drawingSvg';
import { getTextBoxCoordsCanvas } from '../../utilities/drawing';
import type { SVGDrawingHelper } from '../../types';
import ChangeTypes from '../../enums/ChangeTypes';
import { setAnnotationSelected } from '../../stateManagement/annotation/annotationSelection';
import { addContourSegmentationAnnotation } from '../../utilities/contourSegmentation';
import { safeStructuredClone } from '../../utilities/safeStructuredClone';

const { DefaultHistoryMemo } = csUtils.HistoryMemo;

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
  protected eventDispatchDetail: {
    viewportId: string;
    renderingEngineId: string;
  };
  isDrawing: boolean;
  isHandleOutsideImage: boolean;
  editData: {
    annotation: Annotation;
    viewportIdsToRender?: string[];
    newAnnotation?: boolean;
    handleIndex?: number;
    movingTextBox?: boolean;
    hasMoved?: boolean;
  } | null;

  /**
   * Creates a new annotation for the given viewport.  This just adds the
   * viewport reference data to the metadata, and otherwise returns the
   * static class createAnnotation data.
   */
  public static createAnnotationForViewport<T extends Annotation>(
    viewport,
    ...annotationBaseData
  ): T {
    return this.createAnnotation(
      { metadata: viewport.getViewReference() },
      ...annotationBaseData
    ) as T;
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
        isAnnotationLocked(annotation.annotationUID) ||
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
    const { isCanvasAnnotation } = data;
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
      const annotationCanvasCoordinate = isCanvasAnnotation
        ? point.slice(0, 2)
        : viewport.worldToCanvas(point);

      const near =
        vec2.distance(
          canvasCoords,
          annotationCanvasCoordinate as Types.Point2
        ) < proximity;

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
      textBoxBorderRadius: this.getStyle(
        'textBoxBorderRadius',
        specifications,
        annotation
      ),
      textBoxMargin: this.getStyle('textBoxMargin', specifications, annotation),
      textBoxLinkLineColor: this.getStyle(
        'textBoxLinkLineColor',
        specifications,
        annotation
      ),
    };
  }

  /**
   * Renders a linked text box for an annotation using shared visibility, placement,
   * and worldBoundingBox logic. Call from renderAnnotation when the tool uses a
   * linked text box (e.g. Length, RectangleROI). The caller must supply textLines
   * and canvasCoordinates; when text box visibility is off, this method resets
   * data.handles.textBox and returns false.
   *
   * @param options.enabledElement - Cornerstone enabled element
   * @param options.svgDrawingHelper - SVG drawing helper
   * @param options.annotation - Annotation whose text box to render
   * @param options.styleSpecifier - Style specifier for getLinkedTextBoxStyle
   * @param options.textLines - Lines to display (caller responsibility to compute/skip when empty)
   * @param options.canvasCoordinates - Canvas anchor points for the link line (and for placement when placementPoints omitted)
   * @param options.textBoxUID - Optional UID for the text box SVG group (default '1')
   * @param options.placementPoints - Optional; when provided, used for getTextBoxCoordsCanvas only (e.g. circle ROI uses corners for placement, center for link)
   * @returns true if the text box was drawn, false if visibility was off (textBox was reset)
   */
  protected renderLinkedTextBoxAnnotation(options: {
    enabledElement: Types.IEnabledElement;
    svgDrawingHelper: SVGDrawingHelper;
    annotation: Annotation;
    styleSpecifier: StyleSpecifier;
    textLines: string[];
    canvasCoordinates: Types.Point2[];
    textBoxUID?: string;
    placementPoints?: Types.Point2[];
  }): boolean {
    const {
      enabledElement,
      svgDrawingHelper,
      annotation,
      styleSpecifier,
      textLines,
      canvasCoordinates,
      textBoxUID = '1',
      placementPoints,
    } = options;
    const { viewport } = enabledElement;
    const { element } = viewport;
    const { annotationUID, data } = annotation;

    const styleOptions = this.getLinkedTextBoxStyle(styleSpecifier, annotation);
    if (!styleOptions.visibility) {
      data.handles.textBox = {
        hasMoved: false,
        worldPosition: <Types.Point3>[0, 0, 0],
        worldBoundingBox: {
          topLeft: <Types.Point3>[0, 0, 0],
          topRight: <Types.Point3>[0, 0, 0],
          bottomLeft: <Types.Point3>[0, 0, 0],
          bottomRight: <Types.Point3>[0, 0, 0],
        },
      };
      return false;
    }

    if (!data.handles.textBox) {
      data.handles.textBox = {
        hasMoved: false,
        worldPosition: <Types.Point3>[0, 0, 0],
        worldBoundingBox: {
          topLeft: <Types.Point3>[0, 0, 0],
          topRight: <Types.Point3>[0, 0, 0],
          bottomLeft: <Types.Point3>[0, 0, 0],
          bottomRight: <Types.Point3>[0, 0, 0],
        },
      };
    }

    const pointsForPlacement = placementPoints ?? canvasCoordinates;
    if (!data.handles.textBox.hasMoved) {
      const canvasTextBoxCoords = getTextBoxCoordsCanvas(
        pointsForPlacement,
        element,
        textLines
      );
      data.handles.textBox.worldPosition =
        viewport.canvasToWorld(canvasTextBoxCoords);
    }

    const textBoxPosition = viewport.worldToCanvas(
      data.handles.textBox.worldPosition
    );

    const boundingBox = drawLinkedTextBox(
      svgDrawingHelper,
      annotationUID,
      textBoxUID,
      textLines,
      textBoxPosition,
      canvasCoordinates,
      {},
      styleOptions
    );

    const { x: left, y: top, width, height } = boundingBox;
    data.handles.textBox.worldBoundingBox = {
      topLeft: viewport.canvasToWorld([left, top]),
      topRight: viewport.canvasToWorld([left + width, top]),
      bottomLeft: viewport.canvasToWorld([left, top + height]),
      bottomRight: viewport.canvasToWorld([left + width, top + height]),
    };

    return true;
  }

  /**
   * Returns true if the viewport is scaled to SUV units
   * @param viewport - The viewport
   * @param targetId - The annotation targetId
   * @param imageId - The annotation imageId
   * @returns
   */
  public static isSuvScaled(
    viewport: Types.IStackViewport | Types.IVolumeViewport,
    targetId: string,
    imageId?: string
  ): boolean {
    if (viewport instanceof BaseVolumeViewport) {
      const volumeId = csUtils.getVolumeId(targetId);
      const volume = cache.getVolume(volumeId);
      return volume?.scaling?.PT !== undefined;
    }
    const scalingModule: Types.ScalingParameters | undefined =
      imageId && metaData.get('scalingModule', imageId);
    return typeof scalingModule?.suvbw === 'number';
  }

  isSuvScaled = AnnotationTool.isSuvScaled;

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
    const locked = isAnnotationLocked(annotationUID);

    const lineWidth = getStyle('lineWidth') as string;
    const lineDash = getStyle('lineDash') as string;
    const angleArcLineDash = getStyle('angleArcLineDash') as string;
    const color = getStyle('color') as string;
    const markerSize = getStyle('markerSize') as string;
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
      markerSize,
      angleArcLineDash,
    } as AnnotationStyle;
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

  /**
   * Creates an annotation state copy to allow storing the current state of
   * an annotation. Contour and other special keys are handled by safeStructuredClone.
   * Spline is omitted (non-cloneable refs).
   *
   * @param annotation - the annotation to create a clone of
   * @param deleting - a flag to indicate that this object is about to be deleted (deleting true),
   *       or was just created (deleting false), or neither (deleting undefined).
   * @returns state information for the given annotation.
   */
  protected static createAnnotationState(
    annotation: Annotation,
    deleting?: boolean
  ) {
    const { data, annotationUID } = annotation;

    return {
      annotationUID,
      data: safeStructuredClone(data),
      deleting,
    };
  }

  /**
   * Creates an annotation memo storing the current data state on the given
   * annotation object.  This will store/recover handles data, text box and contour
   * data, and if the options are set for deletion, will apply that correctly.
   *
   * @param element - that the annotation is shown on.
   * @param annotation - to store a memo for the current state.
   * @param options - whether the annotation is being created (newAnnotation) or
   *       is in the process of being deleted (`deleting`)
   *       * Note the naming on deleting is to indicate the deletion is in progress,
   *         as the createAnnotationMemo needs to be called BEFORE the annotation
   *         is actually deleted.
   *       * deleting with a value of false is the same as newAnnotation=true,
   *         as it is simply the opposite direction.  Use undefined for both
   *         newAnnotation and deleting for non-create/delete operations.
   * @returns Memo containing the annotation data.
   */
  public static createAnnotationMemo(
    element: HTMLDivElement | null | undefined,
    annotation: Annotation,
    options?: { newAnnotation?: boolean; deleting?: boolean }
  ) {
    if (!annotation) {
      return;
    }
    const { newAnnotation, deleting = newAnnotation ? false : undefined } =
      options || {};
    const { annotationUID } = annotation;
    const state = AnnotationTool.createAnnotationState(annotation, deleting);

    const annotationMemo = {
      restoreMemo: () => {
        const newState = AnnotationTool.createAnnotationState(
          annotation,
          deleting
        );
        const { viewport } = getEnabledElement(element) || {};
        viewport?.setViewReference(annotation.metadata);
        if (state.deleting === true) {
          // Handle un deletion - note the state of deleting is internally
          // true/false/undefined to mean delete/re-create as these are opposite actions.
          state.deleting = false;
          Object.assign(annotation.data, state.data);
          if (annotation.data.contour) {
            const annotationData =
              annotation.data as ContourAnnotationData['data'];

            annotationData.contour.polyline = (
              state.data.contour as ContourAnnotationData['data']['contour']
            ).pointsManager.points;

            delete (
              state.data.contour as ContourAnnotationData['data']['contour']
            ).pointsManager;

            // @ts-expect-error
            if (annotationData.segmentation) {
              addContourSegmentationAnnotation(
                annotation as ContourSegmentationAnnotation
              );
            }
          }
          state.data = newState.data;
          addAnnotation(annotation, element);
          setAnnotationSelected(annotation.annotationUID, true);
          viewport?.render();
          return;
        }
        if (state.deleting === false) {
          // Handle deletion (undo of creation)
          state.deleting = true;
          // Use the current state as the restore state.
          state.data = newState.data;
          setAnnotationSelected(annotation.annotationUID);
          removeAnnotation(annotation.annotationUID);
          viewport?.render();
          return;
        }
        const currentAnnotation = getAnnotation(annotationUID);
        if (!currentAnnotation) {
          console.warn('No current annotation');
          return;
        }
        Object.assign(currentAnnotation.data, state.data);
        if (currentAnnotation.data.contour) {
          (
            currentAnnotation.data
              .contour as ContourAnnotationData['data']['contour']
          ).polyline = (
            state.data.contour as ContourAnnotationData['data']['contour']
          ).pointsManager.points;
        }
        state.data = newState.data;
        currentAnnotation.invalidated = true;
        if (element) {
          triggerAnnotationModified(
            currentAnnotation,
            element,
            ChangeTypes.History
          );
        }
      },
      id: annotationUID,
      operationType: 'annotation',
    };
    DefaultHistoryMemo.push(annotationMemo);
    return annotationMemo;
  }

  /**
   * Creates a memo on the given annotation.
   */
  protected createMemo(element, annotation, options?) {
    this.memo ||= AnnotationTool.createAnnotationMemo(
      element,
      annotation,
      options
    );
  }

  protected startGroupRecording() {
    DefaultHistoryMemo.startGroupRecording();
  }

  /** Ends a group recording of history memo */
  protected endGroupRecording() {
    DefaultHistoryMemo.endGroupRecording();
  }

  protected static hydrateBase<T extends AnnotationTool>(
    ToolClass: new () => T,
    enabledElement: Types.IEnabledElement,
    points: Types.Point3[],
    options: {
      annotationUID?: string;
      toolInstance?: T;
      referencedImageId?: string;
      viewplaneNormal?: Types.Point3;
      viewUp?: Types.Point3;
    } = {}
  ) {
    if (!enabledElement) {
      return null;
    }

    const { viewport } = enabledElement;
    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    const camera = viewport.getCamera();
    const viewPlaneNormal = options.viewplaneNormal ?? camera.viewPlaneNormal;
    const viewUp = options.viewUp ?? camera.viewUp;

    // Create or use provided tool instance
    const instance = options.toolInstance || new ToolClass();

    let referencedImageId;
    let finalViewPlaneNormal = viewPlaneNormal;
    let finalViewUp = viewUp;

    if (options.referencedImageId) {
      // If the provided referencedImageId is not the same as the one calculated
      // by the camera positions, only set the referencedImageId. The scenario
      // here is that only a referencedImageId is given in the options, which
      // does not match the current camera position, so the user is wanting to
      // apply the annotation to a specific image.
      referencedImageId = options.referencedImageId;
      finalViewPlaneNormal = undefined;
      finalViewUp = undefined;
    } else {
      // Only calculate the referenced image ID if not provided in options
      if (viewport instanceof StackViewport) {
        const closestImageIndex = csUtils.getClosestStackImageIndexForPoint(
          points[0],
          viewport
        );

        if (closestImageIndex !== undefined) {
          referencedImageId = viewport.getImageIds()[closestImageIndex];
        }
      } else if (viewport instanceof BaseVolumeViewport) {
        referencedImageId = instance.getReferencedImageId(
          viewport,
          points[0],
          viewPlaneNormal,
          viewUp
        );
      } else {
        throw new Error('Unsupported viewport type');
      }
    }

    return {
      FrameOfReferenceUID,
      referencedImageId,
      viewPlaneNormal: finalViewPlaneNormal,
      viewUp: finalViewUp,
      instance,
      viewport,
    };
  }
}

AnnotationTool.toolName = 'AnnotationTool';
export default AnnotationTool;
