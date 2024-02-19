import {
  getEnabledElement,
  eventTarget,
  triggerEvent,
  utilities,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import {
  getChildAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import {
  drawHandles as drawHandlesSvg,
  drawPolyline as drawPolylineSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg';
import { state } from '../../store';
import {
  Events,
  MouseBindings,
  KeyboardBindings,
  ChangeTypes,
} from '../../enums';
import { resetElementCursor } from '../../cursors/elementCursor';
import type {
  Annotation,
  EventTypes,
  ToolHandle,
  TextBoxHandle,
  PublicToolProps,
  ToolProps,
  AnnotationRenderContext,
} from '../../types';
import {
  math,
  throttle,
  roundNumber,
  triggerAnnotationRenderForViewportIds,
  getCalibratedScale,
  getCalibratedAreaUnits,
} from '../../utilities';
import getMouseModifierKey from '../../eventDispatchers/shared/getMouseModifier';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import { getTextBoxCoordsCanvas } from '../../utilities/drawing';

import { ContourWindingDirection } from '../../types/ContourAnnotation';
import type { SplineROIAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import type {
  AnnotationModifiedEventDetail,
  ContourAnnotationCompletedEventDetail,
} from '../../types/EventTypes';
import { ISpline } from '../../types/ISpline';
import { CardinalSpline } from './splines/CardinalSpline';
import { LinearSpline } from './splines/LinearSpline';
import { CatmullRomSpline } from './splines/CatmullRomSpline';
import { BSpline } from './splines/BSpline';
import ContourSegmentationBaseTool from '../base/ContourSegmentationBaseTool';

const SPLINE_MIN_POINTS = 3;
const SPLINE_CLICK_CLOSE_CURVE_DIST = 10;

const DEFAULT_SPLINE_CONFIG = {
  resolution: 20,
  controlPointAdditionDistance: 6,
  controlPointDeletionDistance: 6,
  showControlPointsConnectors: false,
  controlPointAdditionEnabled: true,
  controlPointDeletionEnabled: true,
};

enum SplineTypesEnum {
  Cardinal = 'CARDINAL',
  Linear = 'LINEAR',
  CatmullRom = 'CATMULLROM',
  BSpline = 'BSPLINE',
}

enum SplineToolActions {
  AddControlPoint = 'addControlPoint',
  DeleteControlPoint = 'deleteControlPoint',
}

class SplineROITool extends ContourSegmentationBaseTool {
  static toolName;
  static SplineTypes = SplineTypesEnum;
  static Actions = SplineToolActions;

  touchDragCallback: any;
  mouseDragCallback: any;
  _throttledCalculateCachedStats: any;
  editData: {
    annotation: SplineROIAnnotation;
    viewportIdsToRender: Array<string>;
    handleIndex?: number;
    movingTextBox?: boolean;
    newAnnotation?: boolean;
    hasMoved?: boolean;
    lastCanvasPoint?: Types.Point2;
    contourHoleProcessingEnabled?: boolean;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage = false;
  fireChangeOnUpdate: {
    annotationUID: string;
    changeType: ChangeTypes;
    contourHoleProcessingEnabled: boolean;
  } = null;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        preventHandleOutsideImage: false,
        calculateStats: true,
        getTextLines: defaultGetTextLines,
        /**
         * Specify which modifier key is used to add a hole to a contour. The
         * modifier must be pressed when the first point of a new contour is added.
         */
        contourHoleAdditionModifierKey: KeyboardBindings.Shift,
        /**
         * The polyline may get processed in order to reduce the number of points
         * for better performance and storage.
         */
        decimate: {
          enabled: false,
          /** A maximum given distance 'epsilon' to decide if a point should or
           * shouldn't be added the resulting polyline which will have a lower
           * number of points for higher `epsilon` values.
           */
          epsilon: 0.1,
        },
        spline: {
          configuration: {
            [SplineTypesEnum.Cardinal]: {
              Class: CardinalSpline,
              scale: 0.5,
            },
            [SplineTypesEnum.CatmullRom]: {
              Class: CatmullRomSpline,
            },
            [SplineTypesEnum.Linear]: {
              Class: LinearSpline,
            },
            [SplineTypesEnum.BSpline]: {
              Class: BSpline,
              controlPointAdditionEnabled: false,
              controlPointDeletionEnabled: false,
              showControlPointsConnectors: true,
            },
          },
          type: SplineTypesEnum.CatmullRom,
          drawPreviewEnabled: true,
          lastControlPointDeletionKeys: ['Backspace', 'Delete'],
        },
        actions: {
          [SplineToolActions.AddControlPoint]: {
            method: 'addControlPointCallback',
            bindings: [
              {
                mouseButton: MouseBindings.Primary,
                modifierKey: KeyboardBindings.Shift,
              },
            ],
          },
          [SplineToolActions.DeleteControlPoint]: {
            method: 'deleteControlPointCallback',
            bindings: [
              {
                mouseButton: MouseBindings.Primary,
                modifierKey: KeyboardBindings.Ctrl,
              },
            ],
          },
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    );
  }

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a CircleROI Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation(evt: EventTypes.InteractionEventType): SplineROIAnnotation {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const { canvas: canvasPos } = currentPoints;
    const contourHoleProcessingEnabled =
      getMouseModifierKey(evt.detail.event) ===
      this.configuration.contourHoleAdditionModifierKey;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;
    const annotation = this.createAnnotation(evt) as SplineROIAnnotation;

    this.isDrawing = true;
    this.addAnnotation(annotation, element);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
      lastCanvasPoint: canvasPos,
      contourHoleProcessingEnabled,
    };

    this._activateDraw(element);
    evt.preventDefault();
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  }

  /**
   * It returns if the canvas point is near the provided annotation in the provided
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
    annotation: SplineROIAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const { instance: spline } = annotation.data.spline;

    return spline.isPointNearCurve(canvasCoords, proximity);
  };

  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: SplineROIAnnotation
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

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    this._activateModify(element);
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
    evt.preventDefault();
  };

  handleSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: SplineROIAnnotation,
    handle: ToolHandle
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { data } = annotation;

    annotation.highlighted = true;

    let movingTextBox = false;
    let handleIndex;

    if ((handle as TextBoxHandle).worldPosition) {
      movingTextBox = true;
    } else {
      const { points } = data.handles;

      handleIndex = points.findIndex((p) => p === handle);
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

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    evt.preventDefault();
  };

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const {
      annotation,
      viewportIdsToRender,
      newAnnotation,
      contourHoleProcessingEnabled,
    } = this.editData;
    const { data } = annotation;
    annotation.autoGenerated = false;

    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);
    resetElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    // Decide whether there's at least one point is outside image
    const image = this.getTargetIdImage(
      this.getTargetId(enabledElement.viewport),
      enabledElement.renderingEngine
    );
    const { imageData, dimensions } = image;
    this.isHandleOutsideImage = data.handles.points
      .map((p) => utilities.transformWorldToIndex(imageData, p))
      .some((index) => !utilities.indexWithinDimensions(index, dimensions));

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeAnnotation(annotation.annotationUID);
    }

    this.fireChangeOnUpdate ||= {
      annotationUID: annotation.annotationUID,
      changeType: newAnnotation
        ? ChangeTypes.Completed
        : ChangeTypes.HandlesUpdated,
      contourHoleProcessingEnabled,
    };

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    this.editData = null;
    this.isDrawing = false;
  };

  private _keyDownCallback = (evt: EventTypes.KeyDownEventType) => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const key = eventDetail.key ?? '';
    const { lastControlPointDeletionKeys } = this.configuration.spline;
    const deleteLastPoint = lastControlPointDeletionKeys.includes(key);

    if (!deleteLastPoint) {
      return;
    }

    const { annotation } = this.editData;
    const { data } = annotation;

    if (data.handles.points.length === SPLINE_MIN_POINTS) {
      this.cancel(element);
      return;
    } else {
      const controlPointIndex = data.handles.points.length - 1;
      this._deleteControlPointByIndex(element, annotation, controlPointIndex);
    }

    evt.preventDefault();
  };

  private _mouseMoveCallback = (evt: EventTypes.InteractionEventType): void => {
    const { drawPreviewEnabled } = this.configuration.spline;

    // Does not force a re-render if preview is not enabled
    if (!drawPreviewEnabled) {
      return;
    }

    const { element } = evt.detail;
    const { renderingEngine } = getEnabledElement(element);
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData.lastCanvasPoint = evt.detail.currentPoints.canvas;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
    evt.preventDefault();
  };

  private _mouseDownCallback = (evt: EventTypes.InteractionEventType): void => {
    const doubleClick = evt.type === Events.MOUSE_DOUBLE_CLICK;
    const { annotation, viewportIdsToRender } = this.editData;
    const { data } = annotation;

    if (data.contour.closed) {
      return;
    }

    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { currentPoints } = eventDetail;
    const { canvas: canvasPoint, world: worldPoint } = currentPoints;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;
    let closeContour = data.handles.points.length >= 2 && doubleClick;
    let addNewPoint = true;

    // Check if user clicked on the first point to close the curve
    if (data.handles.points.length >= 3) {
      const { instance: spline } = data.spline;
      const closestControlPoint = spline.getClosestControlPointWithinDistance(
        canvasPoint,
        SPLINE_CLICK_CLOSE_CURVE_DIST
      );

      if (closestControlPoint?.index === 0) {
        addNewPoint = false;
        closeContour = true;
      }
    }

    if (addNewPoint) {
      data.handles.points.push(worldPoint);
    }

    data.contour.closed = data.contour.closed || closeContour;
    annotation.invalidated = true;
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    if (data.contour.closed) {
      this._endCallback(evt);
    }

    evt.preventDefault();
  };

  private _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, handleIndex, movingTextBox } =
      this.editData;
    const { data } = annotation;

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

      this.moveAnnotation(annotation, worldPosDelta);
    } else {
      // Move mode - after double click, and mouse move to draw
      const { currentPoints } = eventDetail;
      const worldPos = currentPoints.world;

      data.handles.points[handleIndex] = [...worldPos];
      annotation.invalidated = true;
    }

    this.editData.hasMoved = true;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  cancel(element: HTMLDivElement) {
    // If it is not in mid-draw or mid-modify
    if (!this.isDrawing) {
      return;
    }

    this.isDrawing = false;
    this._deactivateDraw(element);
    this._deactivateModify(element);
    resetElementCursor(element);

    const { annotation, viewportIdsToRender, newAnnotation } = this.editData;

    if (newAnnotation) {
      removeAnnotation(annotation.annotationUID);
    }

    super.cancelAnnotation(annotation);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    this.editData = null;
    return annotation.annotationUID;
  }

  /**
   * Triggers an annotation completed event.
   */
  triggerAnnotationCompleted = (
    annotation: SplineROIAnnotation,
    contourHoleProcessingEnabled: boolean
  ): void => {
    const eventType = Events.ANNOTATION_COMPLETED;
    const eventDetail: ContourAnnotationCompletedEventDetail = {
      annotation,
      changeType: ChangeTypes.Completed,
      contourHoleProcessingEnabled,
    };

    triggerEvent(eventTarget, eventType, eventDetail);
  };

  /**
   * Triggers an annotation modified event.
   */
  triggerAnnotationModified = (
    annotation: SplineROIAnnotation,
    enabledElement: Types.IEnabledElement,
    changeType = ChangeTypes.StatsUpdated
  ): void => {
    const { viewportId, renderingEngineId } = enabledElement;
    const eventType = Events.ANNOTATION_MODIFIED;
    const eventDetail: AnnotationModifiedEventDetail = {
      annotation,
      viewportId,
      renderingEngineId,
      changeType,
    };

    triggerEvent(eventTarget, eventType, eventDetail);
  };

  /**
   * Triggers an annotation complete or modified event based on changeType.
   */
  triggerChangeEvent = (
    annotation: SplineROIAnnotation,
    enabledElement: Types.IEnabledElement,
    changeType = ChangeTypes.StatsUpdated,
    contourHoleProcessingEnabled
  ): void => {
    if (changeType === ChangeTypes.Completed) {
      this.triggerAnnotationCompleted(annotation, contourHoleProcessingEnabled);
    } else {
      this.triggerAnnotationModified(annotation, enabledElement, changeType);
    }
  };

  private _activateModify = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  private _deactivateModify = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  private _activateDraw = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.KEY_DOWN, this._keyDownCallback);
    element.addEventListener(Events.MOUSE_MOVE, this._mouseMoveCallback);
    element.addEventListener(Events.MOUSE_DOWN, this._mouseDownCallback);
    element.addEventListener(
      Events.MOUSE_DOUBLE_CLICK,
      this._mouseDownCallback
    );

    element.addEventListener(Events.TOUCH_TAP, this._mouseDownCallback);
  };

  private _deactivateDraw = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.KEY_DOWN, this._keyDownCallback);
    element.removeEventListener(Events.MOUSE_MOVE, this._mouseMoveCallback);
    element.removeEventListener(Events.MOUSE_DOWN, this._mouseDownCallback);
    element.removeEventListener(
      Events.MOUSE_DOUBLE_CLICK,
      this._mouseDownCallback
    );

    element.removeEventListener(Events.TOUCH_TAP, this._mouseDownCallback);
  };

  protected isContourSegmentationTool(): boolean {
    // Disable contour segmentation behavior because it shall be activated only
    // for SplineContourSegmentationTool
    return false;
  }

  /**
   * Render an annotation instance
   * @param renderContext - Render context that contains the annotation, enabledElement, etc.
   * @returns True if the annotation is rendered or false otherwise
   */
  protected renderAnnotationInstance(
    renderContext: AnnotationRenderContext
  ): boolean {
    const { enabledElement, targetId, svgDrawingHelper, annotationStyle } =
      renderContext;
    const { viewport } = enabledElement;
    const { worldToCanvas } = viewport;
    const { element } = viewport;
    const annotation = renderContext.annotation as SplineROIAnnotation;
    const { annotationUID, data, highlighted } = annotation;
    const { handles } = data;
    const { points: controlPoints, activeHandleIndex } = handles;
    const newAnnotation = this.editData?.newAnnotation;

    const {
      lineWidth,
      lineDash,
      color,
      locked: annotationLocked,
    } = annotationStyle;

    const canvasCoordinates = controlPoints.map((p) =>
      worldToCanvas(p)
    ) as Types.Point2[];

    const { drawPreviewEnabled } = this.configuration.spline;
    const splineType = annotation.data.spline.type;
    const splineConfig = this._getSplineConfig(splineType);
    const spline = annotation.data.spline.instance;

    // Update current and all child annotations/splines
    const splineAnnotationsGroup = [
      annotation,
      ...getChildAnnotations(annotation),
    ].filter((annotation) =>
      this._isSplineROIAnnotation(annotation)
    ) as SplineROIAnnotation[];

    splineAnnotationsGroup.forEach((annotation) => {
      const spline = this._updateSplineInstance(element, annotation);
      const splinePolylineCanvas = spline.getPolylinePoints();

      this.updateContourPolyline(
        annotation,
        {
          points: splinePolylineCanvas,
          closed: data.contour.closed,
          targetWindingDirection: ContourWindingDirection.Clockwise,
        },
        viewport
      );
    });

    // Let the base class render the contour
    super.renderAnnotationInstance(renderContext);

    // If cachedStats does not exist, or the areaUnit is missing (as part of
    // import/hydration etc.), force to recalculate the stats from the points
    if (
      !data.cachedStats[targetId] ||
      data.cachedStats[targetId].areaUnit == null
    ) {
      data.cachedStats[targetId] = {
        Modality: null,
        area: null,
        areaUnit: null,
      };

      this._calculateCachedStats(annotation, element);
    } else if (annotation.invalidated) {
      this._throttledCalculateCachedStats(annotation, element);
    }

    let activeHandleCanvasCoords;

    if (!annotationLocked && !this.editData && activeHandleIndex !== null) {
      // Not locked or creating and hovering over handle, so render handle.
      activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]];
    }

    if (activeHandleCanvasCoords || newAnnotation || highlighted) {
      const handleGroupUID = '0';

      // Move this call to the base class (contour seg) in the near future
      drawHandlesSvg(
        svgDrawingHelper,
        annotationUID,
        handleGroupUID,
        canvasCoordinates,
        {
          color,
          lineWidth: Math.max(1, lineWidth),
          handleRadius: '3',
        }
      );
    }

    if (
      drawPreviewEnabled &&
      spline.numControlPoints > 1 &&
      this.editData?.lastCanvasPoint &&
      !spline.closed
    ) {
      const { lastCanvasPoint } = this.editData;
      const previewPolylinePoints = spline.getPreviewPolylinePoints(
        lastCanvasPoint,
        SPLINE_CLICK_CLOSE_CURVE_DIST
      );

      drawPolylineSvg(
        svgDrawingHelper,
        annotationUID,
        'previewSplineChange',
        previewPolylinePoints,
        {
          color: '#9EA0CA',
          lineDash,
          lineWidth: 1,
        }
      );
    }

    if (splineConfig.showControlPointsConnectors) {
      const controlPointsConnectors = [...canvasCoordinates];

      // Connect the last point to the first one when the spline is closed
      if (spline.closed) {
        controlPointsConnectors.push(canvasCoordinates[0]);
      }

      drawPolylineSvg(
        svgDrawingHelper,
        annotationUID,
        'controlPointsConnectors',
        controlPointsConnectors,
        {
          color: 'rgba(255, 255, 255, 0.5)',
          lineWidth: 1,
        }
      );
    }

    this._renderStats(
      annotation,
      viewport,
      svgDrawingHelper,
      annotationStyle.textbox
    );

    if (this.fireChangeOnUpdate?.annotationUID === annotationUID) {
      this.triggerChangeEvent(
        annotation,
        enabledElement,
        this.fireChangeOnUpdate.changeType,
        this.fireChangeOnUpdate.contourHoleProcessingEnabled
      );
      this.fireChangeOnUpdate = null;
    }

    annotation.invalidated = false;
    return true;
  }

  /**
   * Creates new interpolated handles for the spline control given the
   * polyline data.  This allows creating the spline from polyline data
   * directly.
   */
  protected createInterpolatedSplineControl(annotation) {
    if (annotation.data.handles.points?.length) {
      // The interpolation itself created the handles
      return;
    }
    const { polyline } = annotation.data.contour;
    if (!polyline || !polyline.length) {
      return;
    }
    annotation.data.handles.points = [];
    const { points } = annotation.data.handles;
    const increment = Math.max(10, Math.floor(polyline.length / 20));
    for (let i = 0; i < polyline.length - increment; i += increment) {
      points.push(polyline[i]);
    }
    points.push(polyline[polyline.length - 1]);
  }

  protected createAnnotation(evt: EventTypes.InteractionEventType): Annotation {
    const contourAnnotation = super.createAnnotation(evt);
    const { world: worldPos } = evt.detail.currentPoints;
    const { type: splineType } = this.configuration.spline;
    const splineConfig = this._getSplineConfig(splineType);
    const spline = new splineConfig.Class();
    const createSpline = () => ({
      type: splineConfig.type,
      instance: spline,
      resolution: splineConfig.resolution,
    });

    // Add an action to create a new spline data on creating an interpolated
    // instance.
    let onInterpolationComplete;
    if (this.configuration.interpolation?.enabled) {
      onInterpolationComplete = (annotation) => {
        annotation.data.spline ||= createSpline();
        this.createInterpolatedSplineControl(annotation);
      };
    }

    return <SplineROIAnnotation>utilities.deepMerge(contourAnnotation, {
      data: {
        handles: {
          points: [[...worldPos]],
        },
        spline: createSpline(),
        cachedStats: {},
      },
      onInterpolationComplete,
    });
  }

  private _renderStats = (
    annotation,
    viewport,
    svgDrawingHelper,
    textboxStyle
  ) => {
    const data = annotation.data;
    const targetId = this.getTargetId(viewport);

    if (!data.spline.instance.closed || !textboxStyle.visibility) {
      return;
    }

    const textLines = this.configuration.getTextLines(data, targetId);
    if (!textLines || textLines.length === 0) {
      return;
    }

    const canvasCoordinates = data.handles.points.map((p) =>
      viewport.worldToCanvas(p)
    );
    if (!data.handles.textBox.hasMoved) {
      const canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCoordinates);

      data.handles.textBox.worldPosition =
        viewport.canvasToWorld(canvasTextBoxCoords);
    }

    const textBoxPosition = viewport.worldToCanvas(
      data.handles.textBox.worldPosition
    );

    const textBoxUID = 'textBox';
    const boundingBox = drawLinkedTextBoxSvg(
      svgDrawingHelper,
      annotation.annotationUID ?? '',
      textBoxUID,
      textLines,
      textBoxPosition,
      canvasCoordinates,
      {},
      textboxStyle
    );

    const { x: left, y: top, width, height } = boundingBox;

    data.handles.textBox.worldBoundingBox = {
      topLeft: viewport.canvasToWorld([left, top]),
      topRight: viewport.canvasToWorld([left + width, top]),
      bottomLeft: viewport.canvasToWorld([left, top + height]),
      bottomRight: viewport.canvasToWorld([left + width, top + height]),
    };
  };

  addControlPointCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: SplineROIAnnotation
  ) => {
    const { data } = annotation;
    const splineType = data.spline.type;
    const splineConfig = this._getSplineConfig(splineType);
    const maxDist = splineConfig.controlPointAdditionDistance;

    if (splineConfig.controlPointAdditionEnabled === false) {
      return;
    }

    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewport } = enabledElement;
    const { canvasToWorld } = viewport;

    const { instance: spline } = data.spline;
    const canvasPos = evt.detail.currentPoints.canvas;
    const closestPointInfo = spline.getClosestPoint(canvasPos);

    if (closestPointInfo.distance > maxDist) {
      return;
    }

    // Add a point at the `u` position from Parameter Space
    const { index, point: canvasPoint } = spline.addControlPointAtU(
      closestPointInfo.uValue
    );

    data.handles.points.splice(index, 0, canvasToWorld(canvasPoint));
    annotation.invalidated = true;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  private _deleteControlPointByIndex(
    element: HTMLDivElement,
    annotation: SplineROIAnnotation,
    controlPointIndex: number
  ) {
    const enabledElement = getEnabledElement(element);
    const { points: controlPoints } = annotation.data.handles;

    // There is no curve with only 2 points
    if (controlPoints.length === 3) {
      removeAnnotation(annotation.annotationUID);
    } else {
      controlPoints.splice(controlPointIndex, 1);
    }

    const { renderingEngine } = enabledElement;
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    annotation.invalidated = true;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  }

  deleteControlPointCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: SplineROIAnnotation
  ) => {
    const splineType = annotation.data.spline.type;
    const splineConfig = this._getSplineConfig(splineType);
    const maxDist = splineConfig.controlPointDeletionDistance;

    if (splineConfig.controlPointDeletionEnabled === false) {
      return;
    }

    const eventDetail = evt.detail;
    const { element, currentPoints } = eventDetail;
    const { canvas: canvasPos } = currentPoints;
    const { instance: spline } = annotation.data.spline;
    const closestControlPoint = spline.getClosestControlPointWithinDistance(
      canvasPos,
      maxDist
    );

    if (!closestControlPoint) {
      return;
    }

    this._deleteControlPointByIndex(
      element,
      annotation,
      closestControlPoint.index
    );
  };

  _isSplineROIAnnotation(
    annotation: Annotation
  ): annotation is SplineROIAnnotation {
    return !!(<SplineROIAnnotation>annotation).data?.spline;
  }

  /**
   * Get a spline config merged with the default settings.
   * @param type - Spline type (CARDINAL, CATMULLROM, LINEAR or BSPLINE)
   * @returns Spline configuration
   */
  private _getSplineConfig(type: string) {
    const { configuration: config } = this;
    const splineConfigs = config.spline.configuration;

    return Object.assign({ type }, DEFAULT_SPLINE_CONFIG, splineConfigs[type]);
  }

  private _updateSplineInstance(
    element: HTMLDivElement,
    annotation: SplineROIAnnotation
  ): ISpline {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { worldToCanvas } = viewport;
    const { data } = annotation;
    const { type: splineType, instance: spline } = annotation.data.spline;
    const splineConfig = this._getSplineConfig(splineType);
    const worldPoints = data.handles.points;
    const canvasPoints = worldPoints.map(worldToCanvas);
    const resolution =
      splineConfig.resolution !== undefined
        ? parseInt(splineConfig.resolution)
        : undefined;
    const scale =
      splineConfig.scale !== undefined
        ? parseFloat(splineConfig.scale)
        : undefined;

    spline.setControlPoints(canvasPoints);
    spline.closed = !!data.contour.closed;

    // Update spline resolution in case it has changed
    if (
      !spline.fixedResolution &&
      resolution !== undefined &&
      spline.resolution !== resolution
    ) {
      spline.resolution = resolution;
      annotation.invalidated = true;
    }

    // Update Cardinal spline scale in case it has changed
    if (
      spline instanceof CardinalSpline &&
      !spline.fixedScale &&
      scale !== undefined &&
      spline.scale !== scale
    ) {
      spline.scale = scale;
      annotation.invalidated = true;
    }

    return spline;
  }

  private _calculateCachedStats = (
    annotation: SplineROIAnnotation,
    element: HTMLDivElement
  ) => {
    if (!this.configuration.calculateStats) {
      return;
    }
    const data = annotation.data;

    if (!data.contour.closed) {
      return;
    }

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;
    const { cachedStats } = data;
    const { polyline: points } = data.contour;
    const targetIds = Object.keys(cachedStats);

    for (let i = 0; i < targetIds.length; i++) {
      const targetId = targetIds[i];
      const image = this.getTargetIdImage(targetId, renderingEngine);

      // If image does not exists for the targetId, skip. This can be due
      // to various reasons such as if the target was a volumeViewport, and
      // the volumeViewport has been decached in the meantime.
      if (!image) {
        continue;
      }

      const { metadata } = image;
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      // Using an arbitrary start point (canvasPoint), calculate the
      // mm spacing for the canvas in the X and Y directions.
      const canvasPoint = canvasCoordinates[0];
      const originalWorldPoint = viewport.canvasToWorld(canvasPoint);
      const deltaXPoint = viewport.canvasToWorld([
        canvasPoint[0] + 1,
        canvasPoint[1],
      ]);
      const deltaYPoint = viewport.canvasToWorld([
        canvasPoint[0],
        canvasPoint[1] + 1,
      ]);

      const deltaInX = vec3.distance(originalWorldPoint, deltaXPoint);
      const deltaInY = vec3.distance(originalWorldPoint, deltaYPoint);

      const scale = getCalibratedScale(image);
      let area = math.polyline.getArea(canvasCoordinates) / scale / scale;

      // Convert from canvas_pixels ^2 to mm^2
      area *= deltaInX * deltaInY;

      cachedStats[targetId] = {
        Modality: metadata.Modality,
        area,
        areaUnit: getCalibratedAreaUnits(null, image),
      };
    }

    this.triggerAnnotationModified(
      annotation,
      enabledElement,
      ChangeTypes.StatsUpdated
    );

    return cachedStats;
  };
}

function defaultGetTextLines(data, targetId): string[] {
  const cachedVolumeStats = data.cachedStats[targetId];
  const { area, isEmptyArea, areaUnit } = cachedVolumeStats;
  const textLines: string[] = [];

  if (area) {
    const areaLine = isEmptyArea
      ? `Area: Oblique not supported`
      : `Area: ${roundNumber(area)} ${areaUnit}`;

    textLines.push(areaLine);
  }

  return textLines;
}

SplineROITool.toolName = 'SplineROI';
export default SplineROITool;
