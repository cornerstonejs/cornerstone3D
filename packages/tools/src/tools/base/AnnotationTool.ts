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
import ChangeTypes from '../../enums/ChangeTypes';
import { setAnnotationSelected } from '../../stateManagement/annotation/annotationSelection';
import { addContourSegmentationAnnotation } from '../../utilities/contourSegmentation';

const { DefaultHistoryMemo } = csUtils.HistoryMemo;
const { PointsManager } = csUtils;

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
    };
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
   * an annotation.  This class has knowledge about the contour and spline
   * implementations in order to copy the contour object efficiently, and to
   * allow copying the spline object (which has member variables etc).
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

    const cloneData = {
      ...data,
      cachedStats: {},
    } as typeof data;

    delete cloneData.contour;
    delete cloneData.spline;

    const state = {
      annotationUID,
      data: structuredClone(cloneData),
      deleting,
    };

    const contour = (data as ContourAnnotationData['data']).contour;

    if (contour) {
      state.data.contour = {
        ...contour,
        polyline: null,
        pointsManager: PointsManager.create3(
          contour.polyline.length,
          contour.polyline
        ),
      };
    }

    return state;
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
    element,
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
        triggerAnnotationModified(
          currentAnnotation,
          element,
          ChangeTypes.History
        );
      },
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

        if (closestImageIndex) {
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
