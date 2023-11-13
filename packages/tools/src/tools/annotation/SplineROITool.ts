import { AnnotationTool } from '../base';

import {
  getEnabledElement,
  eventTarget,
  triggerEvent,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import throttle from '../../utilities/throttle';
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
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import { getTextBoxCoordsCanvas } from '../../utilities/drawing';
import { resetElementCursor } from '../../cursors/elementCursor';
import {
  EventTypes,
  ToolHandle,
  TextBoxHandle,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
} from '../../types';
import { SplineROIAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import { AnnotationCompletedEventDetail } from '../../types/EventTypes';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import { StyleSpecifier } from '../../types/AnnotationStyle';
import { ISpline } from './splines/types/ISpline';
import { CardinalSpline } from './splines/CardinalSpline';
import { LinearSpline } from './splines/LinearSpline';
import { CatmullRomSpline } from './splines/CatmullRomSpline';
import { BSpline } from './splines/BSpline';

const SPLINE_MIN_POINTS = 3;
const SPLINE_CLICK_CLOSE_CURVE_DIST = 10;

class SplineROITool extends AnnotationTool {
  static toolName;

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
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage = false;
  splines: Map<string, ISpline> = new Map();

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        preventHandleOutsideImage: false,
        spline: {
          configuration: {
            CARDINAL: {
              Class: CardinalSpline,
              scale: 0.5,
            },
            CATMULLROM: {
              Class: CatmullRomSpline,
            },
            LINEAR: {
              Class: LinearSpline,
            },
            BSPLINE: {
              Class: BSpline,
              addControlPointEnabled: false,
              deleteControlPointEnabled: false,
              showControlPointsConnectors: true,
            },
            DEFAULT: {
              resolution: 20,
              addControlPointLineDistance: 6,
              delControlPointDistance: 6,
              addControlPointEnabled: true,
              deleteControlPointEnabled: true,
              showControlPointsConnectors: false,
            },
          },
          type: 'CATMULLROM',
        },
        actions: [
          {
            method: 'addControlPoint',
            bindings: [
              {
                mouseButton: MouseBindings.Primary,
                modifierKey: KeyboardBindings.Shift,
              },
            ],
          },
          {
            method: 'deleteControlPoint',
            bindings: [
              {
                mouseButton: MouseBindings.Primary,
                modifierKey: KeyboardBindings.Ctrl,
              },
            ],
          },
        ],
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

  private _getSplineConfig(type: string) {
    const { configuration: config } = this;
    const splineConfigs = config.spline.configuration;
    const defaultConfig = splineConfigs['DEFAULT'];

    return Object.assign({ type }, defaultConfig, splineConfigs[type]);
  }

  private _getActiveSplineConfig() {
    const { type } = this.configuration.spline;
    return this._getSplineConfig(type);
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
    const worldPos = currentPoints.world;

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    this.isDrawing = true;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;
    const splineConfig = this._getActiveSplineConfig();

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
        label: '',
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
          resolution: splineConfig.resolution,
          closed: false,
        },
        cachedStats: {},
      },
    };

    addAnnotation(annotation, element);
    this._createOrUpdateAnnotationSpline(element, annotation);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      newAnnotation: true,
      hasMoved: false,
    };

    this._activateDraw(element);
    // hideElementCursor(element);
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
    const spline = this._getAnnotationSpline(element, annotation);

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

    const { annotation, viewportIdsToRender, newAnnotation, hasMoved } =
      this.editData;
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
    const { element, keyCode } = eventDetail;
    const key = (eventDetail.key ?? '').toLowerCase();

    console.log('>>>>> key:', key);
    console.log('>>>>> keyCode:', keyCode);
    const deleteLastPoint =
      keyCode === 8 ||
      keyCode === 46 ||
      key === 'backspace' ||
      key === 'delete';

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
      const spline = this._getAnnotationSpline(element, annotation);
      const closestControlPoint = spline.getClosestControlPointWithinRange(
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
    this._createOrUpdateAnnotationSpline(element, annotation);
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

    if (annotation.invalidated) {
      this._createOrUpdateAnnotationSpline(element, annotation);
    }

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
      this._deleteAnnotationSpline(annotation);
      removeAnnotation(annotation.annotationUID);
    }

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    this.editData = null;
    return annotation.annotationUID;
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
    element.addEventListener(Events.MOUSE_DOWN, this._mouseDownCallback);
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
      const { points, activeHandleIndex } = handles;

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

      const canvasCoordinates = points.map((p) =>
        worldToCanvas(p)
      ) as Types.Point2[];

      const { configuration: config } = this;
      const splineType = annotation.data.spline.type;
      const splineConfig = config.spline.configuration[splineType] ?? {};
      const spline = this._getAnnotationSpline(element, annotation);
      const splinePolyline = spline.getPolylinePoints();

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
            color: 'rgba(255, 255,, 255, 0.5)',
            lineDash,
            lineWidth,
          }
        );
      }

      drawPolylineSvg(
        svgDrawingHelper,
        annotationUID,
        'lineSegments',
        splinePolyline,
        {
          color,
          lineDash,
          lineWidth,
        }
      );

      renderStatus = true;
    }

    return renderStatus;
  };

  addControlPoint = (
    evt: EventTypes.InteractionEventType,
    annotation: SplineROIAnnotation
  ) => {
    const splineType = annotation.data.spline.type;
    const splineConfig = this._getSplineConfig(splineType);
    const maxDist = splineConfig.addControlPointLineDistance;

    if (splineConfig.addControlPointEnabled === false) {
      return;
    }

    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewport } = enabledElement;
    const { canvasToWorld } = viewport;

    const spline = this._getAnnotationSpline(element, annotation);
    const canvasPos = evt.detail.currentPoints.canvas;
    const closestPointInfo = spline.getClosestPoint(canvasPos);

    if (closestPointInfo.distance <= maxDist) {
      spline.addControlPointAt(closestPointInfo.uValue);
      annotation.data.handles.points = spline
        .getControlPoints()
        .map((p) => canvasToWorld(p));
      annotation.invalidated = true;
    }

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  deleteControlPoint = (
    evt: EventTypes.InteractionEventType,
    annotation: SplineROIAnnotation
  ) => {
    const splineType = annotation.data.spline.type;
    const splineConfig = this._getSplineConfig(splineType);
    const maxDist = splineConfig.delControlPointDistance;

    if (splineConfig.deleteControlPointEnabled === false) {
      return;
    }

    const eventDetail = evt.detail;
    const { element, currentPoints } = eventDetail;
    const { canvas: canvasPos } = currentPoints;
    const spline = this._getAnnotationSpline(element, annotation);
    const closestControlPoint = spline.getClosestControlPointWithinRange(
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
      this._createOrUpdateAnnotationSpline(element, annotation);
    }

    const { renderingEngine } = enabledElement;
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  }

  private _createOrUpdateAnnotationSpline = (
    element: HTMLDivElement,
    annotation: SplineROIAnnotation
  ): ISpline => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { worldToCanvas } = viewport;
    let spline = this.splines.get(annotation.annotationUID);

    if (!spline) {
      const splineType = annotation.data.spline.type;
      const splineConfig = this._getSplineConfig(splineType);

      console.log('>>>> create :: splineConfig :: ', splineConfig);

      spline = new splineConfig.Class();
      spline.resolution = splineConfig.resolution;

      if (
        splineConfig.scale !== undefined &&
        (<any>spline).scale !== undefined
      ) {
        (<any>spline).scale = splineConfig.scale;
      }

      this.splines.set(annotation.annotationUID, spline);
    }

    const { data } = annotation;
    const worldPoints = data.handles.points;
    const canvasPoints = worldPoints.map(worldToCanvas);

    spline.setControlPoints(canvasPoints);
    spline.closed = !!data.spline?.closed;

    return spline;
  };

  private _getAnnotationSpline = (
    element: HTMLDivElement,
    annotation: SplineROIAnnotation
  ) => {
    let spline = this.splines.get(annotation.annotationUID);

    if (!spline) {
      spline = this._createOrUpdateAnnotationSpline(element, annotation);
    }

    return spline;
  };

  private _deleteAnnotationSpline = (annotation: SplineROIAnnotation) => {
    this.splines.delete(annotation.annotationUID);
  };

  private _calculateCachedStats = (
    annotation,
    viewport,
    renderingEngine,
    enabledElement
  ) => {
    // TODO
  };
}

SplineROITool.toolName = 'SplineROI';
export default SplineROITool;
