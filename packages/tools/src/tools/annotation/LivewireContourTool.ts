import { AnnotationTool } from '../base';

import {
  cache,
  getEnabledElement,
  eventTarget,
  triggerEvent,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
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
import { LivewireContourAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import {
  AnnotationCompletedEventDetail,
  AnnotationModifiedEventDetail,
} from '../../types/EventTypes';
import { StyleSpecifier } from '../../types/AnnotationStyle';

import { Scissors } from './scissors';
import { LivewirePath } from './LiveWirePath';
import { LivewirePoint2 } from './LivewirePoint2';

const { getViewportIdsWithToolToRender } = viewportFilters;
const { getTextBoxCoordsCanvas } = drawing;

const CONTOUR_MIN_POINTS = 2;
const CLICK_CLOSE_CURVE_DIST = 10;

class LivewireContourTool extends AnnotationTool {
  static toolName;

  touchDragCallback: any;
  mouseDragCallback: any;
  editData: {
    annotation: LivewireContourAnnotation;
    viewportIdsToRender: Array<string>;
    handleIndex?: number;
    movingTextBox?: boolean;
    newAnnotation?: boolean;
    hasMoved?: boolean;
    lastCanvasPoint?: Types.Point2;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage = false;
  scissors = new Scissors();

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        preventHandleOutsideImage: false,
        // calculateStats: true,
        // getTextLines: defaultGetTextLines,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  debugRenderLaplaceImage(
    laplacePixelData,
    imgWidth: number,
    imgHeight: number
  ) {
    const dbgImageData = new ImageData(imgWidth, imgHeight);
    const dbgPixelData = dbgImageData.data;
    let dbgMinPixelData = Infinity;
    let dbgMaxPixelData = -Infinity;

    for (let h = 0; h < imgHeight; h++) {
      for (let w = 0; w < imgWidth; w++) {
        dbgMinPixelData = Math.min(dbgMinPixelData, laplacePixelData[h][w]);
        dbgMaxPixelData = Math.max(dbgMaxPixelData, laplacePixelData[h][w]);
      }
    }

    const dbgPixelRange = Math.max(1, dbgMaxPixelData - dbgMinPixelData);

    for (let h = 0; h < imgHeight; h++) {
      for (let w = 0; w < imgWidth; w++) {
        const offset = (h * imgWidth + w) * 4;
        const laplaceValue = laplacePixelData[h][w];
        const pixelValue = Math.round(
          ((laplaceValue - dbgMinPixelData) / dbgPixelRange) * 255
        );

        dbgPixelData[offset] = pixelValue;
        dbgPixelData[offset + 1] = pixelValue;
        dbgPixelData[offset + 2] = pixelValue;
        dbgPixelData[offset + 3] = 255;
      }
    }

    const canvas = document.getElementById('debugCanvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');

    canvas.width = Math.round(imgWidth / (imgHeight / canvas.height));
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    createImageBitmap(dbgImageData).then((image: ImageBitmap) => {
      ctx.strokeStyle = '#000';
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      ctx.strokeRect(0, 0, canvas.width - 1, canvas.height - 1);
    });
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
  ): LivewireContourAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const { world: worldPos, canvas: canvasPos } = currentPoints;

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    this.isDrawing = true;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    const defaultActor = (<Types.IStackViewport>viewport).getDefaultActor();

    if (!defaultActor || !csUtils.isImageActor(defaultActor)) {
      throw new Error('Default actor must be an image actor');
    }

    // const { uid: volumeId } = defaultActor;
    // const volume = cache.getVolume(volumeId);
    const { actor } = defaultActor;
    const vtkImageData = actor.getMapper().getInputData();
    const dimensions = vtkImageData.getDimensions();
    const [width, height] = dimensions;
    const scalarData = vtkImageData.getPointData().getScalars().getData();
    const { voiRange } = viewport.getProperties();
    const { lower: minPixelValue, upper: maxPixelValue } = voiRange;
    const pixelRange = maxPixelValue - minPixelValue;
    const slicePixelData = new Uint8ClampedArray(width * height * 4);

    // TODO: implement for mpr-able series
    for (let i = 0, len = scalarData.length; i < len; i++) {
      const pixelValue = Math.round(
        ((scalarData[i] - minPixelValue) / pixelRange) * 255
      );
      const offset = i * 4;

      slicePixelData[offset] = pixelValue;
      slicePixelData[offset + 1] = pixelValue;
      slicePixelData[offset + 2] = pixelValue;
      slicePixelData[offset + 3] = 255;
    }

    this.scissors.setDimensions(width, height);
    this.scissors.setData(slicePixelData);

    this.debugRenderLaplaceImage((this.scissors as any).laplace, width, height);

    // TODO: See what to do when working with mpr-able because this should be the
    // index from the image space place related to the image sent to scissor.setData()
    const volumePos = csUtils.transformWorldToIndex(vtkImageData, worldPos);
    const slicePos = { x: volumePos[0], y: volumePos[1] };

    this.scissors.doTraining(slicePos);

    const livewirePath = new LivewirePath();
    const currentLivewirePath = new LivewirePath();
    const p0 = new LivewirePoint2(volumePos[0], volumePos[1]);

    livewirePath.addPoint(p0);
    livewirePath.addControlPoint(p0);

    const parentPoints = new Array(height);
    for (let i = 0; i < height; i++) {
      parentPoints[i] = new Array(width);
    }

    const annotation: LivewireContourAnnotation = {
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
        path: {
          confirmedPath: livewirePath,
          currentPath: currentLivewirePath,
          parentPoints,
          closed: false,
        },
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
    annotation: LivewireContourAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const proximitySquared = proximity * proximity;
    const canvasPoints = annotation.data.handles.points.map((p) =>
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
    annotation: LivewireContourAnnotation,
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
    const lastControlPointDeletionKeys = ['Escape', 'Backspace'];
    const deleteLastPoint = lastControlPointDeletionKeys.includes(key);

    if (!deleteLastPoint) {
      return;
    }

    const { annotation } = this.editData;
    const { data } = annotation;

    // if (data.handles.points.length === CONTOUR_MIN_POINTS) {
    //   this.cancel(element);
    //   return;
    // } else {
    //   const handlePointIndex = data.handles.points.length - 1;
    //   this._deleteHandlePointByIndex(element, annotation, handlePointIndex);
    // }

    evt.preventDefault();
  };

  private _mouseMoveCallback = (evt: EventTypes.InteractionEventType): void => {
    const { element, currentPoints } = evt.detail;
    const { world: worldPos, canvas: canvasPos } = currentPoints;
    const { viewport, renderingEngine } = getEnabledElement(element);
    const { annotation } = this.editData;
    const { data } = annotation;
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData.lastCanvasPoint = evt.detail.currentPoints.canvas;

    const defaultActor = (<Types.IStackViewport>viewport).getDefaultActor();
    const { actor } = defaultActor;
    const vtkImageData = actor.getMapper().getInputData();
    const dimensions = vtkImageData.getDimensions();
    const [imgWidth, imgHeight] = dimensions;

    // TODO: See what to do when working with volumes because this should be the
    // index from image space
    const imagePos = csUtils.transformWorldToIndex(vtkImageData, worldPos);
    let slicePoint = { x: imagePos[0], y: imagePos[1] };

    // Check if the point is inside the bounding box
    if (
      slicePoint.x < 0 ||
      slicePoint.y < 0 ||
      slicePoint.x >= imgWidth ||
      slicePoint.y >= imgHeight
    ) {
      return;
    }

    this.scissors.setPoint(slicePoint);

    const { parentPoints } = data.path;

    // Process and update parent points
    while (!parentPoints[slicePoint.y][slicePoint.x]) {
      const updatedParentPoints = this.scissors.doWork();

      if (updatedParentPoints.length === 0) {
        break;
      }

      // Update parent points matrix
      for (let i = 0; i < updatedParentPoints.length - 1; i += 2) {
        const point = updatedParentPoints[i];
        const parentPoint = updatedParentPoints[i + 1];
        parentPoints[point.y][point.x] = parentPoint;
      }
    }

    data.path.currentPath = new LivewirePath();

    // Get the path that goes from the cursor position to the last control point
    while (slicePoint) {
      data.path.currentPath.addPoint(
        new LivewirePoint2(slicePoint.x, slicePoint.y)
      );

      if (
        !parentPoints[slicePoint.y] ||
        !parentPoints[slicePoint.y][slicePoint.x]
      ) {
        break;
      }

      slicePoint = parentPoints[slicePoint.y][slicePoint.x];
    }

    // Merge the current path that goes from the cursor to the last control point
    // and the "confirmed" path that goes from the last control point to the first
    // control point
    data.path.currentPath.appendPath(data.path.confirmedPath);

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
    evt.preventDefault();
  };

  private _mouseDownCallback = (evt: EventTypes.InteractionEventType): void => {
    // const doubleClick = evt.type === Events.MOUSE_DOUBLE_CLICK;
    const { annotation, viewportIdsToRender } = this.editData;
    const { data } = annotation;

    if (data.path.closed) {
      return;
    }

    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { currentPoints } = eventDetail;
    const { canvas: canvasPos, world: worldPos } = currentPoints;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;
    const defaultActor = (<Types.IStackViewport>viewport).getDefaultActor();
    const { actor } = defaultActor;
    const vtkImageData = actor.getMapper().getInputData();
    // const closePath = data.handles.points.length >= 2 && doubleClick;
    let closePath = false;
    // let addNewPoint = true;

    // Check if user clicked on the first point to close the curve
    if (data.handles.points.length >= 3) {
      const closestHandlePoint = {
        index: -1,
        distSquared: Infinity,
      };

      const controlPoints = data.path.confirmedPath.getControlPoints();

      for (let i = 0, len = controlPoints.length; i < len; i++) {
        const controlPoint = controlPoints[i];
        const worldControlPoint = csUtils.transformIndexToWorld(
          vtkImageData,
          controlPoint
        );
        const canvasControlPoint = viewport.worldToCanvas(worldControlPoint);

        const distSquared = math.point.distanceToPointSquared(
          canvasPos,
          canvasControlPoint
        );

        if (
          distSquared <= CLICK_CLOSE_CURVE_DIST &&
          distSquared < closestHandlePoint.distSquared
        ) {
          closestHandlePoint.distSquared = distSquared;
          closestHandlePoint.index = i;
        }
      }

      if (closestHandlePoint.index === 0) {
        // addNewPoint = false;
        console.log('>>>>> CLOSE!!!');
        closePath = true;
      }
    }

    // if (addNewPoint) {
    //   data.handles.points.push(worldPos);
    // }

    data.path.closed = data.path.closed || closePath;

    if (!data.path.closed) {
      const defaultActor = (<Types.IStackViewport>viewport).getDefaultActor();
      const { actor } = defaultActor;
      const vtkImageData = actor.getMapper().getInputData();
      // const dimensions = vtkImageData.getDimensions();
      // const [width, height] = dimensions;
      const volumePos = csUtils.transformWorldToIndex(vtkImageData, worldPos);
      const slicePos = { x: volumePos[0], y: volumePos[1] };
      const { parentPoints } = data.path;

      data.path.confirmedPath = data.path.currentPath;

      for (let row = 0, rows = parentPoints.length; row < rows; row++) {
        parentPoints[row] = new Array(parentPoints[row].length);
      }

      this.scissors.doTraining(slicePos);
      data.path.confirmedPath.addControlPoint(
        data.path.currentPath.getPoint(0)
      );
    }

    annotation.invalidated = true;
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    if (data.path.closed) {
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

    // const targetId = this.getTargetId(viewport);
    // const newAnnotation = this.editData?.newAnnotation;
    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as LivewireContourAnnotation;
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

      // if (activeHandleCanvasCoords || newAnnotation || highlighted) {
      //   const handleGroupUID = '0';
      //   drawHandlesSvg(
      //     svgDrawingHelper,
      //     annotationUID,
      //     handleGroupUID,
      //     canvasCoordinates,
      //     {
      //       color,
      //       lineDash,
      //       lineWidth,
      //       handleRadius: '3',
      //     }
      //   );
      // }

      // const polylinePoints: Types.Point2[] = [...canvasCoordinates];
      // if (!data.path.closed) {
      //   polylinePoints.push([...this.editData.lastCanvasPoint]);
      // }
      // polylinePoints.push([...canvasCoordinates[0]]);
      // drawPolylineSvg(
      //   svgDrawingHelper,
      //   annotationUID,
      //   'polyline',
      //   polylinePoints,
      //   {
      //     color,
      //     lineDash,
      //     lineWidth,
      //   }
      // );

      const defaultActor = (<Types.IStackViewport>viewport).getDefaultActor();
      const { actor } = defaultActor;
      const vtkImageData = actor.getMapper().getInputData();
      const slicePathPoints = data.path.currentPath.pointArray;

      // It would be better to multiply indexToWorld and worldToCanvas and avoid
      // two conversions for each slice point.
      //   - imageData.getIndexToWorld()
      //   - viewport.getWorldToCanvas() // Does not exists and there are CPU and GPU versions
      const worldPathPoints = slicePathPoints.map((point) =>
        csUtils.transformIndexToWorld(vtkImageData, [
          point.getX(),
          point.getY(),
          1, // sliceIndex
        ])
      );

      const canvasPathPoints = worldPathPoints.map((worldPoint) =>
        viewport.worldToCanvas(worldPoint)
      );

      if (!data.path.closed) {
        canvasPathPoints.push([...this.editData.lastCanvasPoint]);
      }

      drawPolylineSvg(
        svgDrawingHelper,
        annotationUID,
        'polyline',
        canvasPathPoints,
        {
          color,
          lineDash,
          lineWidth,
        }
      );

      renderStatus = true;
      annotation.invalidated = false;
    }

    return renderStatus;
  };

  private _deleteHandlePointByIndex(
    element: HTMLDivElement,
    annotation: LivewireContourAnnotation,
    controlPointIndex: number
  ) {
    const enabledElement = getEnabledElement(element);
    const { points } = annotation.data.handles;

    if (points.length === CONTOUR_MIN_POINTS) {
      removeAnnotation(annotation.annotationUID);
    } else {
      points.splice(controlPointIndex, 1);
    }

    const { renderingEngine } = enabledElement;
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    annotation.invalidated = true;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  }
}

LivewireContourTool.toolName = 'LivewireContour';
export default LivewireContourTool;
