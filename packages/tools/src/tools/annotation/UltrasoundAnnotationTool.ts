import { Events, ChangeTypes } from '../../enums';
import {
  getEnabledElement,
  utilities as csUtils,
  utilities,
  getEnabledElementByViewportId,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { AnnotationTool } from '../base';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';
import {
  triggerAnnotationCompleted,
  triggerAnnotationModified,
} from '../../stateManagement/annotation/helpers/state';
import * as lineSegment from '../../utilities/math/line';

import {
  drawHandles as drawHandlesSvg,
  drawHandle as drawHandleSvg,
  drawLine as drawLineSvg,
  drawFan as drawFanSvg,
} from '../../drawingSvg';
import { state } from '../../store/state';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';

import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';

import type {
  EventTypes,
  ToolHandle,
  TextBoxHandle,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
  Annotation,
} from '../../types';
import type { UltrasoundAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import type { StyleSpecifier } from '../../types/AnnotationStyle';
import { intervalFromPoints } from '../../utilities/math/fan/fanUtils';

/**
 * UltrasoundAnnotationTool facilitates the creation and manipulation of specialized annotations
 * for ultrasound imaging. Each annotation comprises a line segment and an associated fan-shaped
 * region, designed to highlight or measure features like B-lines or pleural abnormalities.
 *
 * Interactively, users draw a line by defining two points. A fan is then automatically
 * rendered based on these points and the tool's configuration parameters, such as
 * `fanCenter`, `innerRadius`, `outerRadius`. The visual appearance, including distinct
 * colors for different ultrasound findings (e.g., `bLineColor`, `pleuraColor`),
 * is customizable through the tool's configuration.
 *
 * Annotations are managed by the standard annotation state system, ensuring they
 * are persisted and can be programmatically accessed. These annotations exist in
 * 3D world space and are consistently displayed across multiple viewports
 * sharing the same frame of reference.
 *
 * @example
 * ```javascript
 * // Import necessary modules from Cornerstone Tools
 * import { UltrasoundAnnotationTool, ToolGroupManager, Enums, addTool } from '@cornerstonejs/tools';
 *
 * // Register the tool with the ToolGroupManager (or globally if preferred)
 * addTool(UltrasoundAnnotationTool);
 *
 * // Create a new tool group or get an existing one
 * const toolGroupId = 'myUltrasoundToolGroup';
 * const toolGroup = ToolGroupManager.getToolGroup(toolGroupId) || ToolGroupManager.createToolGroup(toolGroupId);
 *
 * // Add the UltrasoundAnnotationTool's name to the tool group
 * toolGroup.addTool(UltrasoundAnnotationTool.toolName);
 *
 * // Associate a viewport with the tool group
 * toolGroup.addViewport('myViewportId', 'myRenderingEngineId');
 *
 * // Activate the tool for interaction
 * toolGroup.setToolActive(UltrasoundAnnotationTool.toolName, {
 *   bindings: [
 *     {
 *       mouseButton: Enums.MouseBindings.Primary, // e.g., Left mouse button
 *     },
 *   ],
 * });
 *
 * // Optionally, customize the tool's behavior and appearance
 * toolGroup.setToolConfiguration(UltrasoundAnnotationTool.toolName, {
 *   fanCenter: [128, 128, 0], // Center of the fan in image voxel coordinates (IJK)
 *   innerRadius: 10,          // Inner radius of the fan in image voxel units
 *   outerRadius: 50,          // Outer radius of the fan in image voxel units
 *   bLineColor: 'rgba(0, 255, 0, 0.7)', // Color for B-Line type annotations
 *   pleuraColor: 'rgba(89, 0, 255, 0.7)', // Color for Pleura type annotations
 *   // Note: startAngle and endAngle are typically derived from the drawn line points.
 * });
 * ```
 *
 * For comprehensive details on API, configuration options, and advanced usage patterns,
 * refer to the official CornerstoneJS documentation.
 */

class UltrasoundAnnotationTool extends AnnotationTool {
  static toolName = 'UltrasoundAnnotation';

  _throttledCalculateCachedStats: Function;
  editData: {
    annotation: Annotation;
    viewportIdsToRender: string[];
    handleIndex?: number;
    movingTextBox?: boolean;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;
  activeAnnotationType: string;
  pleuraAnnotations: UltrasoundAnnotation[] = [];
  bLineAnnotations: UltrasoundAnnotation[] = [];

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        preventHandleOutsideImage: false,
        getTextLines: defaultGetTextLines,
        fanCenter: null,
        innerRadius: null,
        outerRadius: null,
        startAngle: null,
        endAngle: null,
        bLineColor: 'rgb(0, 255, 0)',
        pleuraColor: 'rgb(0, 4, 255)',
        actions: {
          // TODO - bind globally - but here is actually pretty good as it
          // is almost always active.
          undo: {
            method: 'undo',
            bindings: [{ key: 'z' }],
          },
          redo: {
            method: 'redo',
            bindings: [{ key: 'y' }],
          },
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.activeAnnotationType = 'bLine';
  }

  public setActiveAnnotationType(type: string) {
    this.activeAnnotationType = type;
  }

  public getActiveAnnotationType(): string {
    return this.activeAnnotationType;
  }

  public deleteLastPleuraAnnotation() {
    if (this.pleuraAnnotations.length > 0) {
      const annotation = this.pleuraAnnotations.pop();
      removeAnnotation(annotation.annotationUID);
      triggerAnnotationRenderForViewportIds([annotation.metadata.viewportId]);
    }
  }
  public deleteLastBLineAnnotation() {
    if (this.bLineAnnotations.length > 0) {
      const annotation = this.bLineAnnotations.pop();
      removeAnnotation(annotation.annotationUID);
      triggerAnnotationRenderForViewportIds([annotation.metadata.viewportId]);
    }
  }
  public deleteAllAnnotations() {
    this.pleuraAnnotations.forEach((annotation) => {
      removeAnnotation(annotation.annotationUID);
      triggerAnnotationRenderForViewportIds([annotation.metadata.viewportId]);
    });
    this.bLineAnnotations.forEach((annotation) => {
      removeAnnotation(annotation.annotationUID);
      triggerAnnotationRenderForViewportIds([annotation.metadata.viewportId]);
    });
    this.pleuraAnnotations = [];
    this.bLineAnnotations = [];
  }

  // needs revision
  static hydrate = (
    viewportId: string,
    points: Types.Point3[],
    options?: {
      annotationUID?: string;
      toolInstance?: UltrasoundAnnotationTool;
      referencedImageId?: string;
      viewplaneNormal?: Types.Point3;
      viewUp?: Types.Point3;
    }
  ): UltrasoundAnnotation => {
    const enabledElement = getEnabledElementByViewportId(viewportId);
    if (!enabledElement) {
      return;
    }
    const {
      FrameOfReferenceUID,
      referencedImageId,
      viewPlaneNormal,
      instance,
      viewport,
    } = this.hydrateBase<UltrasoundAnnotationTool>(
      UltrasoundAnnotationTool,
      enabledElement,
      points,
      options
    );

    // Exclude toolInstance from the options passed into the metadata
    const { toolInstance, ...serializableOptions } = options || {};

    const annotation = {
      annotationUID: options?.annotationUID || utilities.uuidv4(),
      data: {
        handles: {
          points,
        },
      },
      highlighted: false,
      autoGenerated: false,
      invalidated: false,
      isLocked: false,
      isVisible: true,
      metadata: {
        toolName: instance.getToolName(),
        viewPlaneNormal,
        FrameOfReferenceUID,
        referencedImageId,
        ...serializableOptions,
      },
    };
    addAnnotation(annotation, viewport.element);

    triggerAnnotationRenderForViewportIds([viewport.id]);
  };

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a Length Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): UltrasoundAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    hideElementCursor(element);
    this.isDrawing = true;

    const {
      viewPlaneNormal,
      viewUp,
      position: cameraPosition,
    } = viewport.getCamera();
    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const annotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        ...viewport.getViewReference({ points: [worldPos] }),
        toolName: this.getToolName(),
        referencedImageId,
        viewUp,
        cameraPosition,
      },
      data: {
        handles: {
          points: [<Types.Point3>[...worldPos], <Types.Point3>[...worldPos]],
          activeHandleIndex: null,
        },
        annotationType: this.getActiveAnnotationType(),
        label: '',
      },
    };

    addAnnotation(annotation, element);
    if (this.activeAnnotationType === 'pleura') {
      this.pleuraAnnotations.push(annotation as UltrasoundAnnotation);
    } else {
      this.bLineAnnotations.push(annotation as UltrasoundAnnotation);
    }

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex: 1,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
    };
    this._activateDraw(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    return annotation as UltrasoundAnnotation;
  };

  /**
   * It returns if the canvas point is near the provided length annotation in the provided
   * element or not. A proximity is passed to the function to determine the
   * proximity of the point to the annotation in number of pixels.
   *
   * @param element - HTML Element
   * @param annotation - Annotation
   * @param canvasCoords - Canvas coordinates
   * @param proximity - Proximity to tool to consider
   * @returns Boolean, whether the canvas point is near tool
   */
  isPointNearTool = (
    element: HTMLDivElement,
    annotation: UltrasoundAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { data } = annotation;
    const [point1, point2] = data.handles.points;
    const canvasPoint1 = viewport.worldToCanvas(point1);
    const canvasPoint2 = viewport.worldToCanvas(point2);

    const line = {
      start: {
        x: canvasPoint1[0],
        y: canvasPoint1[1],
      },
      end: {
        x: canvasPoint2[0],
        y: canvasPoint2[1],
      },
    };

    const distanceToPoint = lineSegment.distanceToPoint(
      [line.start.x, line.start.y],
      [line.end.x, line.end.y],
      [canvasCoords[0], canvasCoords[1]]
    );

    if (distanceToPoint <= proximity) {
      return true;
    }

    return false;
  };

  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: UltrasoundAnnotation
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    annotation.highlighted = true;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      movingTextBox: false,
    };

    this._activateModify(element);

    hideElementCursor(element);

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    evt.preventDefault();
  };

  handleSelectedCallback(
    evt: EventTypes.InteractionEventType,
    annotation: UltrasoundAnnotation,
    handle: ToolHandle
  ): void {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { data } = annotation;

    annotation.highlighted = true;

    let movingTextBox = false;
    let handleIndex;

    if ((handle as TextBoxHandle).worldPosition) {
      movingTextBox = true;
    } else {
      handleIndex = data.handles.points.findIndex((p) => p === handle);
    }

    // Find viewports to render on drag.
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex,
      movingTextBox,
    };
    this._activateModify(element);

    hideElementCursor(element);

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    evt.preventDefault();
  }

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, newAnnotation, hasMoved } =
      this.editData;
    const { data } = annotation;

    if (newAnnotation && !hasMoved) {
      // when user starts the drawing by click, and moving the mouse, instead
      // of click and drag
      return;
    }

    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);
    resetElementCursor(element);

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeAnnotation(annotation.annotationUID);
    }

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);
    this.doneEditMemo();

    if (newAnnotation) {
      triggerAnnotationCompleted(annotation);
    }

    this.editData = null;
    this.isDrawing = false;
  };

  _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const {
      annotation,
      viewportIdsToRender,
      handleIndex,
      movingTextBox,
      newAnnotation,
    } = this.editData;
    const { data } = annotation;

    this.createMemo(element, annotation, { newAnnotation });

    if (movingTextBox) {
      // Drag mode - moving text box
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail;
      const worldPosDelta = deltaPoints.world;

      const { textBox } = data.handles;
      const { worldPosition } = textBox;

      worldPosition[0] += worldPosDelta[0];
      worldPosition[1] += worldPosDelta[1];
      worldPosition[2] += worldPosDelta[2];

      textBox.hasMoved = true;
    } else if (handleIndex === undefined) {
      // Drag mode - moving handle
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail;
      const worldPosDelta = deltaPoints.world;

      const points = data.handles.points;

      points.forEach((point) => {
        point[0] += worldPosDelta[0];
        point[1] += worldPosDelta[1];
        point[2] += worldPosDelta[2];
      });
      annotation.invalidated = true;
    } else {
      // Move mode - after double click, and mouse move to draw
      const { currentPoints } = eventDetail;
      const worldPos = currentPoints.world;

      data.handles.points[handleIndex] = [...worldPos];
      annotation.invalidated = true;
    }

    this.editData.hasMoved = true;

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    if (annotation.invalidated) {
      triggerAnnotationModified(
        annotation,
        element,
        ChangeTypes.HandlesUpdated
      );
    }
  };

  cancel = (element: HTMLDivElement) => {
    // If it is mid-draw or mid-modify
    if (this.isDrawing) {
      this.isDrawing = false;
      this._deactivateDraw(element);
      this._deactivateModify(element);
      resetElementCursor(element);

      const { annotation, viewportIdsToRender, newAnnotation } = this.editData;
      const { data } = annotation;

      annotation.highlighted = false;
      data.handles.activeHandleIndex = null;

      triggerAnnotationRenderForViewportIds(viewportIdsToRender);

      if (newAnnotation) {
        triggerAnnotationCompleted(annotation);
      }

      this.editData = null;
      return annotation.annotationUID;
    }
  };

  _activateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );

    element.addEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
  };

  _deactivateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );

    element.removeEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
  };

  _activateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_MOVE,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );

    element.addEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
  };

  _deactivateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_MOVE,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );

    element.removeEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
  };

  getColorForLineType(annotation: UltrasoundAnnotation) {
    const { annotationType } = annotation.data;
    const { bLineColor, pleuraColor } = this.configuration;

    if (annotationType === 'bLine') {
      return bLineColor;
    }

    if (annotationType === 'pleura') {
      return pleuraColor;
    }

    return bLineColor;
  }
  /**
   * it is used to draw the length annotation in each
   * request animation frame. It calculates the updated cached statistics if
   * data is invalidated and cache it.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    let renderStatus = false;
    const { viewport } = enabledElement;
    const { element } = viewport;

    let annotations = getAnnotations(this.getToolName(), element);

    // Todo: We don't need this anymore, filtering happens in triggerAnnotationRender
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
    const renderingEngine = viewport.getRenderingEngine();

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    const { imageData } = viewport.getImageData();
    const fanCenter = viewport.worldToCanvas(
      imageData.indexToWorld(this.configuration.fanCenter)
    );
    const innerCoordinates = viewport.worldToCanvas(
      imageData.indexToWorld([0, this.configuration.innerRadius, 0])
    );
    const innerRadius = innerCoordinates[1];

    const outerCoordinates = viewport.worldToCanvas(
      imageData.indexToWorld([0, this.configuration.outerRadius, 0])
    );
    const outerRadius = outerCoordinates[1];

    // for debug purposes
    // if (0) {
    //   // drawFan
    //   const fanUID = '2';
    //   const startAngle = this.configuration.startAngle;
    //   const endAngle = this.configuration.endAngle;
    //   const fanDataId = 'main-fan';
    //   const annotationUID = 'main-fan';
    //   drawFanSvg(
    //     svgDrawingHelper,
    //     annotationUID,
    //     fanUID,
    //     fanCenter,
    //     innerRadius,
    //     outerRadius,
    //     startAngle,
    //     endAngle,
    //     {
    //       color: this.configuration.bLineColor,
    //       fill: this.configuration.bLineColor,
    //       fillOpacity: 0.2,
    //     },
    //     fanDataId
    //   );

    //   drawHandleSvg(
    //     svgDrawingHelper,
    //     'center',
    //     '1',
    //     fanCenter,
    //     {
    //       color: this.configuration.bLineColor,
    //       fill: this.configuration.bLineColor,
    //       radius: 5,
    //     },
    //     1
    //   );
    //   return;
    // }

    // Draw SVG
    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as UltrasoundAnnotation;
      const { annotationUID, data } = annotation;
      const { points, activeHandleIndex } = data.handles;

      styleSpecifier.annotationUID = annotationUID;

      const { color, lineWidth, lineDash, shadow } = this.getAnnotationStyle({
        annotation,
        styleSpecifier,
      });

      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      let activeHandleCanvasCoords;

      if (!isAnnotationVisible(annotationUID)) {
        continue;
      }

      if (
        !isAnnotationLocked(annotationUID) &&
        !this.editData &&
        activeHandleIndex !== null
      ) {
        // Not locked or creating and hovering over handle, so render handle.
        activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]];
      }

      if (activeHandleCanvasCoords) {
        const handleGroupUID = '0';

        drawHandlesSvg(
          svgDrawingHelper,
          annotationUID,
          handleGroupUID,
          canvasCoordinates,
          {
            color,
            lineDash,
            lineWidth,
          }
        );
      }

      const dataId = `${annotationUID}-line`;
      const lineUID = '1';
      drawLineSvg(
        svgDrawingHelper,
        annotationUID,
        lineUID,
        canvasCoordinates[0],
        canvasCoordinates[1],
        {
          color,
          width: lineWidth,
          lineDash,
          shadow,
        },
        dataId
      );

      // drawFan
      const fanUID = '2';
      const angles = intervalFromPoints(fanCenter, canvasCoordinates);
      const fanDataId = `${annotationUID}-fan`;
      drawFanSvg(
        svgDrawingHelper,
        annotationUID,
        fanUID,
        fanCenter,
        innerRadius,
        outerRadius,
        angles[0],
        angles[1],
        {
          color: this.getColorForLineType(annotation),
          fill: this.getColorForLineType(annotation),
          fillOpacity: 0.2,
          width: lineWidth,
          lineDash,
          shadow,
        },
        fanDataId
      );

      renderStatus = true;

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }
    }

    return renderStatus;
  };

  _isInsideVolume(index1, index2, dimensions) {
    return (
      csUtils.indexWithinDimensions(index1, dimensions) &&
      csUtils.indexWithinDimensions(index2, dimensions)
    );
  }
}

function defaultGetTextLines(data, targetId): string[] {
  return [''];
}

export default UltrasoundAnnotationTool;
