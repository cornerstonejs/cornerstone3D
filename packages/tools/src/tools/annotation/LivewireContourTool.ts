import { vec3 } from 'gl-matrix';

import {
  getEnabledElement,
  eventTarget,
  triggerEvent,
  utilities as csUtils,
  VolumeViewport,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { removeAnnotation } from '../../stateManagement/annotation/annotationState';
import { drawHandles as drawHandlesSvg } from '../../drawingSvg';
import { state } from '../../store';
import { Events, ChangeTypes } from '../../enums';
import { resetElementCursor } from '../../cursors/elementCursor';
import type {
  Annotation,
  EventTypes,
  ToolHandle,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
} from '../../types';
import { math, triggerAnnotationRenderForViewportIds } from '../../utilities';
import { LivewireContourAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import {
  AnnotationCompletedEventDetail,
  AnnotationModifiedEventDetail,
} from '../../types/EventTypes';

import { LivewireScissors } from '../../utilities/livewire/LivewireScissors';
import { LivewirePath } from '../../utilities/livewire/LiveWirePath';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import ContourSegmentationBaseTool from '../base/ContourSegmentationBaseTool';

const CLICK_CLOSE_CURVE_SQR_DIST = 10 ** 2; // px

class LivewireContourTool extends ContourSegmentationBaseTool {
  public static toolName: string;
  private scissors: LivewireScissors;

  touchDragCallback: any;
  mouseDragCallback: any;
  editData: {
    annotation: LivewireContourAnnotation;
    viewportIdsToRender: Array<string>;
    handleIndex?: number;
    newAnnotation?: boolean;
    hasMoved?: boolean;
    lastCanvasPoint?: Types.Point2;
    confirmedPath?: LivewirePath;
    currentPath?: LivewirePath;
    closed?: boolean;
    worldToSlice?: (point: Types.Point3) => Types.Point2;
    sliceToWorld?: (point: Types.Point2) => Types.Point3;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage = false;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        preventHandleOutsideImage: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a CircleROI Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation(
    evt: EventTypes.InteractionEventType
  ): LivewireContourAnnotation {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const { world: worldPos, canvas: canvasPos } = currentPoints;

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    this.isDrawing = true;

    const viewportImageData = viewport.getImageData();
    const { imageData: vtkImageData } = viewportImageData;
    let worldToSlice: (point: Types.Point3) => Types.Point2;
    let sliceToWorld: (point: Types.Point2) => Types.Point3;
    let { scalarData } = viewportImageData;
    let width;
    let height;

    if (!(viewport instanceof VolumeViewport) && scalarData) {
      width = viewportImageData.dimensions[0];
      height = viewportImageData.dimensions[1];

      // Method only to simplify the code making stack and volume viewports code
      // similar and avoiding `if(stack)/else` whenever a coordinate needs to be
      // transformed because `worldToSlice` in this case returns the same IJK
      // coordinate from index space.
      worldToSlice = (point: Types.Point3) => {
        const ijkPoint = csUtils.transformWorldToIndex(vtkImageData, point);
        return [ijkPoint[0], ijkPoint[1]];
      };

      // Method only to simplify the code making stack and volume viewports code
      // similar and avoiding `if(stack)/else` whenever a coordinate needs to be
      // transformed because `sliceToWorld` in this case receives the same IJK
      // coordinate from index space.
      sliceToWorld = (point: Types.Point2) =>
        csUtils.transformIndexToWorld(vtkImageData, [point[0], point[1], 0]);
    } else if (viewport instanceof VolumeViewport) {
      const sliceImageData = csUtils.getCurrentVolumeViewportSlice(viewport);
      const { sliceToIndexMatrix, indexToSliceMatrix } = sliceImageData;

      worldToSlice = (point: Types.Point3) => {
        const ijkPoint = csUtils.transformWorldToIndex(vtkImageData, point);
        const slicePoint = vec3.transformMat4(
          [0, 0, 0],
          ijkPoint,
          indexToSliceMatrix
        );

        return [slicePoint[0], slicePoint[1]];
      };

      sliceToWorld = (point: Types.Point2) => {
        const ijkPoint = vec3.transformMat4(
          [0, 0, 0],
          [point[0], point[1], 0],
          sliceToIndexMatrix
        ) as Types.Point3;

        return csUtils.transformIndexToWorld(vtkImageData, ijkPoint);
      };

      scalarData = sliceImageData.scalarData;
      width = sliceImageData.width;
      height = sliceImageData.height;
    } else {
      throw new Error('Viewport not supported');
    }
    scalarData = csUtils.convertToGrayscale(scalarData, width, height);
    const { voiRange } = viewport.getProperties();
    const startPos = worldToSlice(worldPos);

    this.scissors = LivewireScissors.createInstanceFromRawPixelData(
      scalarData as Float32Array,
      width,
      height,
      voiRange
    );

    this.scissors.startSearch(startPos);

    const confirmedPath = new LivewirePath();
    const currentPath = new LivewirePath();

    confirmedPath.addPoint(startPos);
    confirmedPath.addControlPoint(startPos);

    const annotation = this.createAnnotation(evt) as LivewireContourAnnotation;

    this.addAnnotation(annotation, element);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      newAnnotation: true,
      hasMoved: false,
      lastCanvasPoint: canvasPos,
      confirmedPath: confirmedPath,
      currentPath: currentPath,
      closed: false,
      worldToSlice,
      sliceToWorld,
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
    annotation: LivewireContourAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const proximitySquared = proximity * proximity;
    const canvasPoints = annotation.data.contour.polyline.map((p) =>
      viewport.worldToCanvas(p)
    );

    let startPoint = canvasPoints[canvasPoints.length - 1];

    for (let i = 0; i < canvasPoints.length; i++) {
      const endPoint = canvasPoints[i];
      const distanceToPointSquared = math.lineSegment.distanceToPointSquared(
        startPoint,
        endPoint,
        canvasCoords
      );

      if (distanceToPointSquared <= proximitySquared) {
        return true;
      }

      startPoint = endPoint;
    }

    return false;
  };

  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: LivewireContourAnnotation
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
    };

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    this._activateModify(element);
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
    evt.preventDefault();
  };

  handleSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: LivewireContourAnnotation,
    handle: ToolHandle
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { data } = annotation;

    annotation.highlighted = true;

    const { points } = data.handles;
    const handleIndex = points.findIndex((p) => p === handle);

    // Find viewports to render on drag.
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex,
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
        changeType: ChangeTypes.Completed,
      };

      triggerEvent(eventTarget, eventType, eventDetail);
    }

    this.editData = null;
    this.scissors = null;
    this.isDrawing = false;
  };

  private _mouseDownCallback = (evt: EventTypes.InteractionEventType): void => {
    const doubleClick = evt.type === Events.MOUSE_DOUBLE_CLICK;
    const { annotation, viewportIdsToRender, worldToSlice, sliceToWorld } =
      this.editData;

    if (this.editData.closed) {
      return;
    }

    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { currentPoints } = eventDetail;
    const { canvas: canvasPos, world: worldPosOriginal } = currentPoints;
    let worldPos = worldPosOriginal;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;
    const controlPoints = this.editData.currentPath.getControlPoints();
    let closePath = controlPoints.length >= 2 && doubleClick;

    // Check if user clicked on the first point to close the curve
    if (controlPoints.length >= 2) {
      const closestHandlePoint = {
        index: -1,
        distSquared: Infinity,
      };

      // Check if there is a control point close to the cursor
      for (let i = 0, len = controlPoints.length; i < len; i++) {
        const controlPoint = controlPoints[i];
        const worldControlPoint = sliceToWorld(controlPoint);
        const canvasControlPoint = viewport.worldToCanvas(worldControlPoint);

        const distSquared = math.point.distanceToPointSquared(
          canvasPos,
          canvasControlPoint
        );

        if (
          distSquared <= CLICK_CLOSE_CURVE_SQR_DIST &&
          distSquared < closestHandlePoint.distSquared
        ) {
          closestHandlePoint.distSquared = distSquared;
          closestHandlePoint.index = i;
        }
      }

      if (closestHandlePoint.index === 0) {
        closePath = true;
      }
    }

    this.editData.closed = this.editData.closed || closePath;
    this.editData.confirmedPath = this.editData.currentPath;

    const smoothPathCount = this.scissors.smoothPathCount(
      this.editData.confirmedPath.pointArray,
      this.editData.currentPath.getLastControlPoint()
    );
    if (smoothPathCount) {
      this.editData.currentPath.removeLastPoints(smoothPathCount);
      annotation.data.contour.polyline.splice(
        annotation.data.contour.polyline.length - smoothPathCount,
        smoothPathCount
      );
      worldPos =
        annotation.data.contour.polyline[
          annotation.data.contour.polyline.length - 1
        ];
    }

    // Add the current cursor position as a new control point after clicking
    const lastPoint = this.editData.currentPath.getLastPoint();

    this.editData.confirmedPath.addControlPoint(lastPoint);
    annotation.data.handles.points.push(sliceToWorld(lastPoint));

    // Start a new search starting at the last control point
    this.scissors.startSearch(worldToSlice(worldPos));

    annotation.invalidated = true;
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    if (this.editData.closed) {
      // Update the annotation because `editData` will be set to null
      this._updateAnnotation(element, this.editData.confirmedPath);
      this._endCallback(evt);
    }

    evt.preventDefault();
  };

  private _mouseMoveCallback = (evt: EventTypes.InteractionEventType): void => {
    const { element, currentPoints } = evt.detail;
    const { world: worldPos, canvas: canvasPos } = currentPoints;
    const { renderingEngine } = getEnabledElement(element);
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData.lastCanvasPoint = canvasPos;

    const { width: imgWidth, height: imgHeight } = this.scissors;
    const { worldToSlice } = this.editData;
    const slicePoint: Types.Point2 = worldToSlice(worldPos);

    // Check if the point is inside the bounding box
    if (
      slicePoint[0] < 0 ||
      slicePoint[1] < 0 ||
      slicePoint[0] >= imgWidth ||
      slicePoint[1] >= imgHeight
    ) {
      return;
    }

    const pathPoints = this.scissors.findPathToPoint(slicePoint);
    const currentPath = new LivewirePath();

    for (let i = 0, len = pathPoints.length; i < len; i++) {
      currentPath.addPoint(pathPoints[i]);
    }

    // Merge the "confirmed" path that goes from the first control point to the
    // last one with the current path that goes from the last control point to
    // the cursor point
    currentPath.prependPath(this.editData.confirmedPath);

    // Store the new path
    this.editData.currentPath = currentPath;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
    evt.preventDefault();
  };

  private _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, handleIndex } = this.editData;
    const { data } = annotation;

    if (handleIndex === undefined) {
      // Drag mode - moving object
      console.warn('No drag implemented for livewire');
    } else {
      // Move mode - after double click, and mouse move to draw
      const { currentPoints } = eventDetail;
      const worldPos = currentPoints.world;
      console.log('Dragging handle', worldPos);

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
    this.scissors = null;
    return annotation.annotationUID;
  };

  /**
   * Triggers an annotation modified event.
   */
  triggerAnnotationModified = (
    annotation: LivewireContourAnnotation,
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

    element.removeEventListener(Events.MOUSE_MOVE, this._mouseMoveCallback);
    element.removeEventListener(Events.MOUSE_DOWN, this._mouseDownCallback);
    element.removeEventListener(
      Events.MOUSE_DOUBLE_CLICK,
      this._mouseDownCallback
    );

    element.removeEventListener(Events.TOUCH_TAP, this._mouseDownCallback);
  };

  public renderAnnotation(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean {
    const { viewport } = enabledElement;
    const { element } = viewport;

    // Update the annotation that is in editData (being edited)
    this._updateAnnotation(element, this.editData?.currentPath);

    return super.renderAnnotation(enabledElement, svgDrawingHelper);
  }

  protected isContourSegmentationTool(): boolean {
    // Disable contour segmenatation behavior because it shall be activated only
    // for LivewireContourSegmentationTool
    return false;
  }

  protected createAnnotation(evt: EventTypes.InteractionEventType): Annotation {
    const contourSegmentationAnnotation = super.createAnnotation(evt);
    const { world: worldPos } = evt.detail.currentPoints;

    return <LivewireContourAnnotation>csUtils.deepMerge(
      contourSegmentationAnnotation,
      {
        data: {
          handles: {
            points: [[...worldPos]],
          },
        },
      }
    );
  }

  /**
   * Render an annotation instance
   * @param renderContext - Render context that contains the annotation, enabledElement, etc.
   * @returns True if the annotation is rendered or false otherwise
   */
  protected renderAnnotationInstance(renderContext: {
    enabledElement: Types.IEnabledElement;
    targetId: string;
    annotation: Annotation;
    annotationStyle: Record<string, any>;
    svgDrawingHelper: SVGDrawingHelper;
  }): boolean {
    const { enabledElement, svgDrawingHelper, annotationStyle } = renderContext;
    const { viewport } = enabledElement;
    const { worldToCanvas } = viewport;
    const annotation = renderContext.annotation as LivewireContourAnnotation;
    const { annotationUID, data, highlighted } = annotation;
    const { handles } = data;
    const newAnnotation = this.editData?.newAnnotation;
    const { lineWidth, lineDash, color } = annotationStyle;

    // Render the first control point only when the annotation is drawn for the
    // first time to make it easier to know where the user needs to click to
    // to close the ROI.
    if (
      highlighted ||
      (newAnnotation &&
        annotation.annotationUID === this.editData?.annotation?.annotationUID)
    ) {
      const handleGroupUID = '0';
      const canvasHandles = handles.points.map(worldToCanvas);

      drawHandlesSvg(
        svgDrawingHelper,
        annotationUID,
        handleGroupUID,
        canvasHandles,
        {
          color,
          lineDash,
          lineWidth,
        }
      );
    }

    // Let the base class render the contour
    super.renderAnnotationInstance(renderContext);

    return true;
  }

  private _updateAnnotation(
    element: HTMLDivElement,
    livewirePath: LivewirePath
  ) {
    if (!this.editData || !livewirePath) {
      return;
    }

    const { pointArray: imagePoints } = livewirePath;
    const worldPolylinePoints: Types.Point3[] = [];
    const { annotation, sliceToWorld } = this.editData;

    for (let i = 0, len = imagePoints.length; i < len; i++) {
      const imagePoint = imagePoints[i];
      const worldPoint = sliceToWorld(imagePoint);
      worldPolylinePoints.push(worldPoint);
    }

    if (worldPolylinePoints.length > 1) {
      worldPolylinePoints.push([...worldPolylinePoints[0]]);
    }

    annotation.data.contour.polyline = worldPolylinePoints;
  }
}

LivewireContourTool.toolName = 'LivewireContour';
export default LivewireContourTool;
