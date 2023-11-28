import { AnnotationTool } from '../base';

import {
  getEnabledElement,
  eventTarget,
  triggerEvent,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';
import {
  drawHandles as drawHandlesSvg,
  drawPolyline as drawPolylineSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg';
import { state } from '../../store';
import { Events, MouseBindings, KeyboardBindings } from '../../enums';
import { resetElementCursor } from '../../cursors/elementCursor';
import {
  EventTypes,
  ToolHandle,
  TextBoxHandle,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
} from '../../types';
import {
  math,
  viewportFilters,
  drawing,
  throttle,
  roundNumber,
  triggerAnnotationRenderForViewportIds,
  getCalibratedScale,
  getCalibratedAreaUnits,
} from '../../utilities';
import { SplineROIAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import {
  AnnotationCompletedEventDetail,
  AnnotationModifiedEventDetail,
} from '../../types/EventTypes';
import { StyleSpecifier } from '../../types/AnnotationStyle';
import { ISpline } from '../../types/ISpline';
import { CardinalSpline } from './splines/CardinalSpline';
import { LinearSpline } from './splines/LinearSpline';
import { CatmullRomSpline } from './splines/CatmullRomSpline';
import { BSpline } from './splines/BSpline';

const { getViewportIdsWithToolToRender } = viewportFilters;
const { getTextBoxCoordsCanvas } = drawing;

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

class SplineROITool extends AnnotationTool {
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
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage = false;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        preventHandleOutsideImage: false,
        calculateStats: true,
        getTextLines: defaultGetTextLines,
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
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): SplineROIAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const { world: worldPos, canvas: canvasPos } = currentPoints;

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    this.isDrawing = true;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const { type: splineType } = this.configuration.spline;
    const splineConfig = this._getSplineConfig(splineType);
    const spline = new splineConfig.Class();

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    const annotation: SplineROIAnnotation = {
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
          points: [[...worldPos]],
          activeHandleIndex: null,
        },
        spline: {
          type: splineConfig.type,
          instance: spline,
          resolution: splineConfig.resolution,
          closed: false,
          polyline: [],
        },
        cachedStats: {},
      },
    };

    addAnnotation(annotation, element);

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
    };

    this._activateDraw(element);
    evt.preventDefault();
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

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

    const { annotation, viewportIdsToRender, newAnnotation } = this.editData;
    const { data } = annotation;

    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);
    resetElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeAnnotation(annotation.annotationUID);
    }

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    if (newAnnotation) {
      const eventType = Events.ANNOTATION_COMPLETED;
      const eventDetail: AnnotationCompletedEventDetail = {
        annotation,
      };

      triggerEvent(eventTarget, eventType, eventDetail);
    }

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

    if (data.spline.closed) {
      return;
    }

    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { currentPoints } = eventDetail;
    const { canvas: canvasPoint, world: worldPoint } = currentPoints;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;
    let closeSpline = data.handles.points.length >= 2 && doubleClick;
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
        closeSpline = true;
      }
    }

    if (addNewPoint) {
      data.handles.points.push(worldPoint);
    }

    data.spline.closed = data.spline.closed || closeSpline;
    annotation.invalidated = true;
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    if (data.spline.closed) {
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

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  cancel = (element: HTMLDivElement) => {
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

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    this.editData = null;
    return annotation.annotationUID;
  };

  /**
   * Triggers an annotation modified event.
   */
  triggerAnnotationModified = (
    annotation: SplineROIAnnotation,
    enabledElement: Types.IEnabledElement
  ): void => {
    const { viewportId, renderingEngineId } = enabledElement;
    const eventType = Events.ANNOTATION_MODIFIED;

    const eventDetail: AnnotationModifiedEventDetail = {
      annotation,
      viewportId,
      renderingEngineId,
    };

    triggerEvent(eventTarget, eventType, eventDetail);
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

  /**
   * it is used to draw the circleROI annotation in each
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
    const { worldToCanvas } = viewport;
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
    const newAnnotation = this.editData?.newAnnotation;
    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as SplineROIAnnotation;
      const { annotationUID, data, highlighted } = annotation;
      const { handles } = data;
      const { points: controlPoints, activeHandleIndex } = handles;

      styleSpecifier.annotationUID = annotationUID;

      const lineWidth = this.getStyle(
        'lineWidth',
        styleSpecifier,
        annotation
      ) as number;
      const lineDash = this.getStyle(
        'lineDash',
        styleSpecifier,
        annotation
      ) as string;
      const color = this.getStyle(
        'color',
        styleSpecifier,
        annotation
      ) as string;

      const canvasCoordinates = controlPoints.map((p) =>
        worldToCanvas(p)
      ) as Types.Point2[];

      const { drawPreviewEnabled } = this.configuration.spline;
      const splineType = annotation.data.spline.type;
      const splineConfig = this._getSplineConfig(splineType);
      const spline = this._updateSplineInstance(element, annotation);
      const splinePolylineCanvas = spline.getPolylinePoints();
      const splinePolylineWorld = [];

      for (let i = 0, len = splinePolylineCanvas.length; i < len; i++) {
        splinePolylineWorld.push(
          viewport.canvasToWorld(splinePolylineCanvas[i])
        );
      }

      data.spline.polyline = splinePolylineWorld;

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

      if (!isAnnotationVisible(annotationUID)) {
        continue;
      }

      if (
        !isAnnotationLocked(annotation) &&
        !this.editData &&
        activeHandleIndex !== null
      ) {
        // Not locked or creating and hovering over handle, so render handle.
        activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]];
      }

      if (activeHandleCanvasCoords || newAnnotation || highlighted) {
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
            lineWidth,
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
            lineDash,
            lineWidth,
          }
        );
      }

      drawPolylineSvg(
        svgDrawingHelper,
        annotationUID,
        'lineSegments',
        splinePolylineCanvas,
        {
          color,
          lineDash,
          lineWidth,
        }
      );

      this._renderStats(annotation, viewport, enabledElement, svgDrawingHelper);

      renderStatus = true;
      annotation.invalidated = false;
    }

    return renderStatus;
  };

  _renderStats = (annotation, viewport, enabledElement, svgDrawingHelper) => {
    const data = annotation.data;
    const targetId = this.getTargetId(viewport);

    if (!data.spline.closed) {
      return;
    }

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    const options = this.getLinkedTextBoxStyle(styleSpecifier, annotation);
    if (!options.visibility) {
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
      options
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

  private _updateSplineScale(spline: ISpline, annotation: SplineROIAnnotation) {
    const splineType = annotation.data.spline.type;
    const splineConfig = this._getSplineConfig(splineType);

    if (
      !(spline instanceof CardinalSpline) ||
      spline.fixedScale ||
      splineConfig.scale === undefined ||
      spline.scale === splineConfig.scale
    ) {
      return;
    }

    spline.scale = splineConfig.scale;
    annotation.invalidated = true;
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

    spline.setControlPoints(canvasPoints);
    spline.closed = !!data.spline?.closed;

    // Update spline resolution in case it has changed
    if (spline.resolution !== splineConfig.resolution) {
      spline.resolution = parseInt(splineConfig.resolution);
      annotation.invalidated = true;
    }

    // Update Cardinal spline scale in case it has changed
    if (
      spline instanceof CardinalSpline &&
      !spline.fixedScale &&
      splineConfig.scale !== undefined &&
      spline.scale !== splineConfig.scale
    ) {
      spline.scale = splineConfig.scale;
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

    if (!data.spline.closed) {
      return;
    }

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;
    const { cachedStats } = data;
    const { polyline: points } = data.spline;
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
      let area =
        math.polyline.calculateAreaOfPoints(canvasCoordinates) / scale / scale;

      // Convert from canvas_pixels ^2 to mm^2
      area *= deltaInX * deltaInY;

      cachedStats[targetId] = {
        Modality: metadata.Modality,
        area,
        areaUnit: getCalibratedAreaUnits(null, image),
      };
    }

    this.triggerAnnotationModified(annotation, enabledElement);

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
